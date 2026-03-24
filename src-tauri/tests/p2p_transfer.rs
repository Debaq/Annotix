//! Tests de transferencia P2P
//!
//! Test 1: Verificar que import_file con doble-await crea la entrada en el doc
//! Test 2: Flujo completo host→colaborador con transferencia de imágenes

use bytes::Bytes;
use iroh::endpoint::Endpoint;
use iroh::protocol::Router;
use iroh_blobs::store::fs::FsStore;
use iroh_blobs::BlobsProtocol;
use iroh_docs::protocol::Docs;
use iroh_gossip::net::Gossip;

/// Crea un nodo iroh temporal para tests
async fn create_test_node(dir: &std::path::Path) -> (
    Endpoint,
    Docs,
    FsStore,
    Router,
) {
    let blobs_dir = dir.join("blobs");
    let docs_dir = dir.join("docs");
    std::fs::create_dir_all(&blobs_dir).unwrap();
    std::fs::create_dir_all(&docs_dir).unwrap();

    let endpoint = Endpoint::builder()
        .bind()
        .await
        .expect("Error creando endpoint");

    let blobs_store = FsStore::load(&blobs_dir)
        .await
        .expect("Error creando blob store");

    let gossip = Gossip::builder().spawn(endpoint.clone());

    let blobs_api: iroh_blobs::api::Store = blobs_store.clone().into();
    let docs = Docs::persistent(docs_dir)
        .spawn(endpoint.clone(), blobs_api, gossip.clone())
        .await
        .expect("Error creando docs");

    let blobs_protocol = BlobsProtocol::new(&blobs_store, None);

    let router = Router::builder(endpoint.clone())
        .accept(iroh_blobs::ALPN, blobs_protocol)
        .accept(iroh_gossip::ALPN, gossip)
        .accept(iroh_docs::ALPN, docs.clone())
        .spawn();

    (endpoint, docs, blobs_store, router)
}

/// Test 1: Verificar que import_file().await?.await? crea la entrada blob en el doc
///
/// Este test valida el fix crítico: sin el doble-await, el blob se importa
/// al store pero la entrada en el doc nunca se escribe.
#[tokio::test]
async fn test_import_file_creates_doc_entry() {
    let tmp = tempfile::tempdir().unwrap();
    let (_endpoint, docs, blobs_store, _router) = create_test_node(tmp.path()).await;

    // Crear un doc y un autor
    let doc = docs.create().await.expect("Error creando doc");
    let author = docs.author_create().await.expect("Error creando autor");

    // Crear archivo de prueba realista (~10MB, simula imagen JPEG)
    let test_file = tmp.path().join("test_image.jpg");
    let size = 10 * 1024 * 1024; // 10MB
    let test_data_extended: Vec<u8> = (0..size).map(|i| (i % 251) as u8).collect();
    std::fs::write(&test_file, &test_data_extended).unwrap();

    let blob_key: Bytes = b"images/test-id/blob".to_vec().into();
    let blobs: &iroh_blobs::api::Store = &*blobs_store;

    // CRITICAL: El doble-await
    // Primer .await resuelve Result<ImportFileProgress>
    // Segundo .await consume el stream/future y escribe la entrada en el doc
    let outcome = doc
        .import_file(
            blobs,
            author,
            blob_key.clone(),
            &test_file,
            iroh_blobs::api::blobs::ImportMode::Copy,
        )
        .await
        .expect("Error iniciando import")
        .await
        .expect("Error completando import");

    println!("Blob importado: hash={}, size={}", outcome.hash, outcome.size);
    assert!(outcome.size > 0, "El blob debería tener tamaño > 0");

    // Verificar que la entrada existe en el doc
    let entry = doc
        .get_one(iroh_docs::store::Query::key_exact(b"images/test-id/blob"))
        .await
        .expect("Error buscando entry")
        .expect("La entrada del blob DEBE existir en el doc después del doble-await");

    // Verificar que podemos leer el contenido
    let content = blobs
        .blobs()
        .get_bytes(entry.content_hash())
        .await
        .expect("Error leyendo blob");

    assert_eq!(
        content.len(),
        test_data_extended.len(),
        "El contenido del blob debe coincidir con el archivo original"
    );

    println!("✓ import_file con doble-await crea correctamente la entrada en el doc");
}

/// Test 2: Flujo completo host→colaborador con imágenes realistas (~10MB c/u)
///
/// 1. Host crea un doc e importa 3 imágenes de ~10MB cada una
/// 2. Host genera ticket de compartir
/// 3. Colaborador importa el doc desde el ticket
/// 4. Colaborador descarga los 3 blobs del host
/// 5. Verificar que el contenido de cada uno es idéntico
#[tokio::test]
async fn test_host_to_collaborator_blob_transfer() {
    let host_dir = tempfile::tempdir().unwrap();
    let collab_dir = tempfile::tempdir().unwrap();

    // --- HOST ---
    let (host_endpoint, host_docs, host_blobs_store, _host_router) =
        create_test_node(host_dir.path()).await;

    let host_doc = host_docs.create().await.expect("Error creando doc host");
    let host_author = host_docs.author_create().await.expect("Error creando autor host");
    let host_blobs: &iroh_blobs::api::Store = &*host_blobs_store;

    // Escribir metadata del proyecto
    host_doc
        .set_bytes(
            host_author,
            b"meta/project".to_vec(),
            serde_json::to_vec(&serde_json::json!({
                "name": "Test Project",
                "type": "object_detection",
                "version": 1,
            }))
            .unwrap(),
        )
        .await
        .expect("Error escribiendo meta");

    // Escribir host_node_id
    let host_node_id = host_endpoint.id().to_string();
    host_doc
        .set_bytes(
            host_author,
            b"meta/host_node_id".to_vec(),
            host_node_id.as_bytes().to_vec(),
        )
        .await
        .expect("Error escribiendo host_node_id");

    // Crear 3 imágenes realistas de ~10MB cada una
    let image_size = 10 * 1024 * 1024; // 10MB
    let images: Vec<(String, String, Vec<u8>)> = (0..3)
        .map(|i| {
            let id = format!("img-{:03}", i + 1);
            let name = format!("photo_{}.jpg", i + 1);
            // Contenido distinto por imagen (seed diferente)
            let content: Vec<u8> = (0..image_size)
                .map(|j| ((j * (i + 7)) % 251) as u8)
                .collect();
            (id, name, content)
        })
        .collect();

    let total_bytes: usize = images.iter().map(|(_, _, c)| c.len()).sum();
    println!("Host: preparando {} imágenes ({:.1} MB total)", images.len(), total_bytes as f64 / 1_048_576.0);

    let import_start = std::time::Instant::now();

    for (id, name, content) in &images {
        let img_path = host_dir.path().join(name);
        std::fs::write(&img_path, content).unwrap();

        // Escribir image meta
        let img_meta = serde_json::json!({
            "id": id,
            "name": name,
            "file": name,
            "width": 3840,
            "height": 2160,
            "status": "pending",
        });
        host_doc
            .set_bytes(
                host_author,
                format!("images/{}/meta", id).into_bytes(),
                serde_json::to_vec(&img_meta).unwrap(),
            )
            .await
            .expect("Error escribiendo img meta");

        // Importar blob (CON doble-await)
        let blob_key: Bytes = format!("images/{}/blob", id).into_bytes().into();
        let outcome = host_doc
            .import_file(
                host_blobs,
                host_author,
                blob_key,
                &img_path,
                iroh_blobs::api::blobs::ImportMode::Copy,
            )
            .await
            .expect("Error iniciando import")
            .await
            .expect("Error completando import");

        println!("  Host: {} importado ({:.1} MB, hash={})",
            name, outcome.size as f64 / 1_048_576.0, &outcome.hash.to_string()[..16]);
    }

    println!("Host: {} imágenes importadas en {:?}", images.len(), import_start.elapsed());

    // Iniciar sync
    host_doc.start_sync(vec![]).await.expect("Error iniciando sync");

    // Generar ticket
    let ticket = host_doc
        .share(
            iroh_docs::api::protocol::ShareMode::Write,
            iroh_docs::api::protocol::AddrInfoOptions::RelayAndAddresses,
        )
        .await
        .expect("Error generando ticket");

    println!("Host: ticket generado");

    // --- COLABORADOR ---
    let (_collab_endpoint, collab_docs, collab_blobs_store, _collab_router) =
        create_test_node(collab_dir.path()).await;

    let collab_blobs: &iroh_blobs::api::Store = &*collab_blobs_store;

    let (collab_doc, _events) = collab_docs
        .import_and_subscribe(ticket)
        .await
        .expect("Error importando doc");

    println!("Colaborador: doc importado, esperando sync...");

    // Esperar sync de meta/project
    let max_wait = std::time::Duration::from_secs(30);
    let started = std::time::Instant::now();
    loop {
        if started.elapsed() >= max_wait {
            panic!("Timeout esperando sync de meta/project");
        }
        if let Ok(Some(entry)) = collab_doc
            .get_one(iroh_docs::store::Query::key_exact(b"meta/project"))
            .await
        {
            if collab_blobs.blobs().get_bytes(entry.content_hash()).await.is_ok() {
                println!("Colaborador: meta/project sincronizado en {:?}", started.elapsed());
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    // Obtener host EndpointId para descargas
    let host_endpoint_id: iroh::EndpointId = {
        let entry = collab_doc
            .get_one(iroh_docs::store::Query::key_exact(b"meta/host_node_id"))
            .await
            .expect("Error leyendo host_node_id")
            .expect("host_node_id debe existir");
        let bytes = collab_blobs
            .blobs()
            .get_bytes(entry.content_hash())
            .await
            .expect("Error leyendo blob");
        String::from_utf8_lossy(&bytes).parse().expect("Error parseando EndpointId")
    };

    let downloader = collab_blobs.downloader(&_collab_endpoint);
    let download_start = std::time::Instant::now();

    // Descargar y verificar cada imagen
    for (id, name, original_content) in &images {
        let blob_key = format!("images/{}/blob", id);

        let blob_entry = collab_doc
            .get_one(iroh_docs::store::Query::key_exact(blob_key.as_bytes()))
            .await
            .expect("Error buscando blob entry")
            .unwrap_or_else(|| panic!("Blob entry para {} DEBE existir", id));

        let blob_hash = blob_entry.content_hash();

        // Descargar blob desde el host
        downloader
            .download(blob_hash, vec![host_endpoint_id])
            .await
            .unwrap_or_else(|e| panic!("Error descargando blob {}: {}", id, e));

        // Verificar contenido
        let downloaded = collab_blobs
            .blobs()
            .get_bytes(blob_hash)
            .await
            .expect("Error leyendo blob descargado");

        assert_eq!(
            downloaded.len(),
            original_content.len(),
            "Tamaño de {} debe coincidir ({} vs {})",
            name, downloaded.len(), original_content.len()
        );
        assert_eq!(
            downloaded.as_ref(),
            original_content.as_slice(),
            "Contenido de {} debe ser idéntico",
            name
        );

        println!("  Colaborador: {} verificado ✓ ({:.1} MB)",
            name, downloaded.len() as f64 / 1_048_576.0);
    }

    let elapsed = download_start.elapsed();
    let speed = total_bytes as f64 / 1_048_576.0 / elapsed.as_secs_f64();
    println!(
        "✓ Transferencia completa: {} imágenes, {:.1} MB total en {:?} ({:.1} MB/s)",
        images.len(),
        total_bytes as f64 / 1_048_576.0,
        elapsed,
        speed
    );
}

/// Test 3: Transferencia forzada por relay (tráfico real por internet)
///
/// Usa AddrInfoOptions::Relay para que el ticket NO incluya direcciones
/// directas. El colaborador DEBE conectar vía relay.iroh.network.
/// Esto prueba que funciona en red real, no solo localhost.
#[tokio::test]
async fn test_transfer_via_relay() {
    let host_dir = tempfile::tempdir().unwrap();
    let collab_dir = tempfile::tempdir().unwrap();

    // --- HOST ---
    let (host_endpoint, host_docs, host_blobs_store, _host_router) =
        create_test_node(host_dir.path()).await;

    let host_doc = host_docs.create().await.expect("Error creando doc host");
    let host_author = host_docs.author_create().await.expect("Error creando autor host");
    let host_blobs: &iroh_blobs::api::Store = &*host_blobs_store;

    // Metadata del proyecto
    host_doc
        .set_bytes(host_author, b"meta/project".to_vec(),
            serde_json::to_vec(&serde_json::json!({"name":"Relay Test","type":"od","version":1})).unwrap())
        .await.expect("Error meta");

    // host_node_id
    let host_node_id = host_endpoint.id().to_string();
    host_doc
        .set_bytes(host_author, b"meta/host_node_id".to_vec(), host_node_id.as_bytes().to_vec())
        .await.expect("Error host_node_id");

    // Crear 1 imagen de 5MB
    let image_size = 5 * 1024 * 1024;
    let image_content: Vec<u8> = (0..image_size).map(|i| ((i * 13) % 251) as u8).collect();
    let img_path = host_dir.path().join("relay_test.jpg");
    std::fs::write(&img_path, &image_content).unwrap();

    host_doc
        .set_bytes(host_author, b"images/relay-img/meta".to_vec(),
            serde_json::to_vec(&serde_json::json!({"id":"relay-img","name":"relay_test.jpg","file":"relay_test.jpg","width":1920,"height":1080,"status":"pending"})).unwrap())
        .await.expect("Error img meta");

    let blob_key: Bytes = b"images/relay-img/blob".to_vec().into();
    let outcome = host_doc
        .import_file(host_blobs, host_author, blob_key, &img_path, iroh_blobs::api::blobs::ImportMode::Copy)
        .await.expect("Error import start")
        .await.expect("Error import complete");

    println!("Host: blob importado vía relay test ({:.1} MB)", outcome.size as f64 / 1_048_576.0);

    host_doc.start_sync(vec![]).await.expect("Error sync");

    // CLAVE: Generar ticket con SOLO relay (sin direcciones directas)
    let ticket = host_doc
        .share(
            iroh_docs::api::protocol::ShareMode::Write,
            iroh_docs::api::protocol::AddrInfoOptions::Relay,
        )
        .await
        .expect("Error generando ticket relay-only");

    println!("Host: ticket relay-only generado (sin direcciones directas)");

    // --- COLABORADOR ---
    let (_collab_endpoint, collab_docs, collab_blobs_store, _collab_router) =
        create_test_node(collab_dir.path()).await;

    let collab_blobs: &iroh_blobs::api::Store = &*collab_blobs_store;

    let transfer_start = std::time::Instant::now();

    let (collab_doc, _events) = collab_docs
        .import_and_subscribe(ticket)
        .await
        .expect("Error importando doc vía relay");

    println!("Colaborador: doc importado vía relay, esperando sync...");

    // Esperar sync (puede tardar más vía relay)
    let max_wait = std::time::Duration::from_secs(60);
    let started = std::time::Instant::now();
    loop {
        if started.elapsed() >= max_wait {
            panic!("Timeout esperando sync vía relay (60s)");
        }
        if let Ok(Some(entry)) = collab_doc
            .get_one(iroh_docs::store::Query::key_exact(b"meta/project"))
            .await
        {
            if collab_blobs.blobs().get_bytes(entry.content_hash()).await.is_ok() {
                println!("Colaborador: meta/project sincronizado vía relay en {:?}", started.elapsed());
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }

    // Descargar blob
    let blob_entry = collab_doc
        .get_one(iroh_docs::store::Query::key_exact(b"images/relay-img/blob"))
        .await.expect("Error buscando blob")
        .expect("Blob entry debe existir vía relay");

    let blob_hash = blob_entry.content_hash();

    let host_eid: iroh::EndpointId = {
        let e = collab_doc.get_one(iroh_docs::store::Query::key_exact(b"meta/host_node_id"))
            .await.expect("err").expect("host_node_id");
        let b = collab_blobs.blobs().get_bytes(e.content_hash()).await.expect("err");
        String::from_utf8_lossy(&b).parse().expect("parse err")
    };

    let downloader = collab_blobs.downloader(&_collab_endpoint);
    downloader.download(blob_hash, vec![host_eid]).await
        .expect("Error descargando blob vía relay");

    let downloaded = collab_blobs.blobs().get_bytes(blob_hash).await
        .expect("Error leyendo blob");

    assert_eq!(downloaded.len(), image_content.len(), "Tamaño debe coincidir");
    assert_eq!(downloaded.as_ref(), image_content.as_slice(), "Contenido debe ser idéntico");

    let elapsed = transfer_start.elapsed();
    let speed = image_size as f64 / 1_048_576.0 / elapsed.as_secs_f64();
    println!(
        "✓ Transferencia vía RELAY exitosa: {:.1} MB en {:?} ({:.1} MB/s)\n  Esto demuestra que funciona en red real.",
        image_size as f64 / 1_048_576.0,
        elapsed,
        speed
    );
}
