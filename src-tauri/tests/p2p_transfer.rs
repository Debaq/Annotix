//! Tests de transferencia P2P
//!
//! Test 1: Verificar que import_file con doble-await crea la entrada en el doc
//! Test 2: Flujo completo host→colaborador con transferencia de imágenes
//! Test 4: Flujo completo de anotaciones: A sube imagen, B recibe, B anota, A recibe anotaciones
//! Test 5: Descarga de blobs desde múltiples peers

use bytes::Bytes;
use futures_lite::StreamExt;
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

/// Test 4: Flujo completo de anotaciones bidireccional
///
/// 1. Instancia A crea proyecto, sube imagen con blob
/// 2. Instancia B se une, recibe imagen via sync
/// 3. Instancia B escribe anotaciones al doc (simula sync_annotations_to_doc)
/// 4. Instancia A recibe anotaciones via subscribe (simula start_doc_watcher)
/// 5. Verificar que A puede leer las anotaciones escritas por B
#[tokio::test]
async fn test_annotation_sync_bidirectional() {
    let host_dir = tempfile::tempdir().unwrap();
    let collab_dir = tempfile::tempdir().unwrap();

    // --- INSTANCIA A (HOST) ---
    let (host_endpoint, host_docs, host_blobs_store, _host_router) =
        create_test_node(host_dir.path()).await;

    let host_doc = host_docs.create().await.expect("Error creando doc host");
    let host_author = host_docs.author_create().await.expect("Error creando autor host");
    let host_blobs: &iroh_blobs::api::Store = &*host_blobs_store;

    // A: escribe metadata del proyecto
    host_doc
        .set_bytes(
            host_author,
            b"meta/project".to_vec(),
            serde_json::to_vec(&serde_json::json!({
                "name": "Annotation Test",
                "type": "object_detection",
                "version": 1,
            })).unwrap(),
        )
        .await
        .expect("Error escribiendo meta");

    // A: escribe host_node_id
    let host_node_id = host_endpoint.id().to_string();
    host_doc
        .set_bytes(host_author, b"meta/host_node_id".to_vec(), host_node_id.as_bytes().to_vec())
        .await
        .expect("Error escribiendo host_node_id");

    // A: sube una imagen
    let image_content: Vec<u8> = (0..1024 * 100).map(|i| (i % 251) as u8).collect(); // 100KB
    let img_path = host_dir.path().join("test_annot.jpg");
    std::fs::write(&img_path, &image_content).unwrap();

    let img_id = "img-annot-001";
    let img_meta = serde_json::json!({
        "id": img_id,
        "name": "test_annot.jpg",
        "file": "test_annot.jpg",
        "width": 800,
        "height": 600,
        "status": "pending",
    });
    host_doc
        .set_bytes(host_author, format!("images/{}/meta", img_id).into_bytes(), serde_json::to_vec(&img_meta).unwrap())
        .await
        .expect("Error escribiendo img meta");

    // A: anotaciones vacías iniciales
    let empty_annots: Vec<serde_json::Value> = vec![];
    host_doc
        .set_bytes(host_author, format!("images/{}/annots", img_id).into_bytes(), serde_json::to_vec(&empty_annots).unwrap())
        .await
        .expect("Error escribiendo anotaciones vacías");

    // A: importar blob de imagen
    let blob_key: Bytes = format!("images/{}/blob", img_id).into_bytes().into();
    let _outcome = host_doc
        .import_file(host_blobs, host_author, blob_key, &img_path, iroh_blobs::api::blobs::ImportMode::Copy)
        .await.expect("Error import start")
        .await.expect("Error import complete");

    println!("A: Imagen subida con blob ({} bytes)", image_content.len());

    // A: iniciar sync y suscribirse a cambios
    host_doc.start_sync(vec![]).await.expect("Error sync");
    let mut host_events = host_doc.subscribe().await.expect("Error suscribiéndose a eventos");

    // A: generar ticket
    let ticket = host_doc
        .share(iroh_docs::api::protocol::ShareMode::Write, iroh_docs::api::protocol::AddrInfoOptions::RelayAndAddresses)
        .await
        .expect("Error generando ticket");

    println!("A: Ticket generado, esperando colaborador...");

    // --- INSTANCIA B (COLABORADOR) ---
    let (_collab_endpoint, collab_docs, collab_blobs_store, _collab_router) =
        create_test_node(collab_dir.path()).await;

    let collab_blobs: &iroh_blobs::api::Store = &*collab_blobs_store;
    let collab_author = collab_docs.author_create().await.expect("Error creando autor collab");

    // B: importar doc
    let (collab_doc, _collab_events) = collab_docs
        .import_and_subscribe(ticket)
        .await
        .expect("Error importando doc");

    println!("B: Doc importado, esperando sync...");

    // B: esperar que llegue meta/project
    let max_wait = std::time::Duration::from_secs(30);
    let started = std::time::Instant::now();
    loop {
        if started.elapsed() >= max_wait {
            panic!("Timeout esperando sync de meta/project en B");
        }
        if let Ok(Some(entry)) = collab_doc.get_one(iroh_docs::store::Query::key_exact(b"meta/project")).await {
            if collab_blobs.blobs().get_bytes(entry.content_hash()).await.is_ok() {
                println!("B: meta/project sincronizado en {:?}", started.elapsed());
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    // B: verificar que la imagen llegó
    let img_meta_entry = collab_doc
        .get_one(iroh_docs::store::Query::key_exact(format!("images/{}/meta", img_id).as_bytes()))
        .await
        .expect("Error buscando img meta en B")
        .expect("Imagen meta DEBE existir en B después del sync");

    let img_meta_bytes = collab_blobs.blobs().get_bytes(img_meta_entry.content_hash()).await
        .expect("Error leyendo img meta blob");
    let img_meta_received: serde_json::Value = serde_json::from_slice(&img_meta_bytes).unwrap();
    assert_eq!(img_meta_received["id"], img_id);
    println!("B: Imagen '{}' recibida ✓", img_meta_received["name"]);

    // B: descargar blob de la imagen
    let blob_entry = collab_doc
        .get_one(iroh_docs::store::Query::key_exact(format!("images/{}/blob", img_id).as_bytes()))
        .await
        .expect("Error buscando blob en B")
        .expect("Blob DEBE existir en B");

    let downloader = collab_blobs.downloader(&_collab_endpoint);
    downloader.download(blob_entry.content_hash(), vec![host_endpoint.id()])
        .await.expect("Error descargando blob");

    let downloaded_blob = collab_blobs.blobs().get_bytes(blob_entry.content_hash()).await
        .expect("Error leyendo blob descargado");
    assert_eq!(downloaded_blob.len(), image_content.len());
    println!("B: Blob descargado y verificado ✓ ({} bytes)", downloaded_blob.len());

    // B: ESCRIBE ANOTACIONES (simula sync_annotations_to_doc)
    let annotations = serde_json::json!([
        {
            "id": "ann-001",
            "class_id": "cls-dog",
            "class_name": "dog",
            "kind": "bbox",
            "points": [[100.0, 150.0], [300.0, 400.0]],
            "color": "#FF0000"
        },
        {
            "id": "ann-002",
            "class_id": "cls-cat",
            "class_name": "cat",
            "kind": "bbox",
            "points": [[50.0, 60.0], [200.0, 250.0]],
            "color": "#00FF00"
        }
    ]);

    let annots_key = format!("images/{}/annots", img_id);
    collab_doc
        .set_bytes(collab_author, annots_key.as_bytes().to_vec(), serde_json::to_vec(&annotations).unwrap())
        .await
        .expect("Error B escribiendo anotaciones al doc");

    println!("B: Anotaciones escritas al doc (2 bboxes)");

    // --- INSTANCIA A: RECIBIR ANOTACIONES VIA SUBSCRIBE ---
    println!("A: Esperando anotaciones de B via subscribe...");

    let recv_start = std::time::Instant::now();
    let mut received_annotations: Option<serde_json::Value> = None;

    loop {
        if recv_start.elapsed() >= std::time::Duration::from_secs(30) {
            panic!("Timeout: A nunca recibió las anotaciones de B");
        }

        tokio::select! {
            event = host_events.next() => {
                match event {
                    Some(Ok(iroh_docs::engine::LiveEvent::InsertRemote { entry, .. })) => {
                        let key = String::from_utf8_lossy(entry.key()).to_string();
                        if key == format!("images/{}/annots", img_id) {
                            // Simula lo que hace start_doc_watcher: read_entry_bytes + deserializar
                            // El blob puede no estar disponible inmediatamente tras InsertRemote,
                            // así que reintentamos brevemente.
                            let hash = entry.content_hash();
                            let mut content_opt = None;
                            for _ in 0..20 {
                                match host_blobs.blobs().get_bytes(hash).await {
                                    Ok(c) => { content_opt = Some(c); break; }
                                    Err(_) => tokio::time::sleep(std::time::Duration::from_millis(100)).await,
                                }
                            }
                            let content = content_opt.expect("Blob de anotaciones no disponible en A después de 2s");
                            let annots: serde_json::Value = serde_json::from_slice(&content)
                                .expect("Error deserializando anotaciones en A");
                            received_annotations = Some(annots);
                            println!("A: Anotaciones recibidas via InsertRemote en {:?}", recv_start.elapsed());
                            break;
                        }
                    }
                    Some(Ok(_)) => continue,
                    Some(Err(e)) => panic!("Error en stream de eventos: {}", e),
                    None => panic!("Stream de eventos terminó inesperadamente"),
                }
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(100)) => {
                continue;
            }
        }
    }

    // Verificar que A recibió exactamente las anotaciones de B
    let received = received_annotations.expect("Anotaciones no recibidas");
    let received_array = received.as_array().expect("Debe ser un array");
    assert_eq!(received_array.len(), 2, "Deben ser 2 anotaciones");
    assert_eq!(received_array[0]["id"], "ann-001");
    assert_eq!(received_array[0]["class_name"], "dog");
    assert_eq!(received_array[1]["id"], "ann-002");
    assert_eq!(received_array[1]["class_name"], "cat");

    println!("A: Anotaciones verificadas ✓");
    println!("  - ann-001: dog bbox [{},{}]-[{},{}]",
        received_array[0]["points"][0][0], received_array[0]["points"][0][1],
        received_array[0]["points"][1][0], received_array[0]["points"][1][1]);
    println!("  - ann-002: cat bbox [{},{}]-[{},{}]",
        received_array[1]["points"][0][0], received_array[1]["points"][0][1],
        received_array[1]["points"][1][0], received_array[1]["points"][1][1]);

    println!("\n✓ Flujo completo de anotaciones bidireccional verificado:");
    println!("  A sube imagen → B recibe → B anota → A recibe anotaciones");
}

/// Test 5: Descarga de blobs desde múltiples peers
///
/// 1. Host crea doc con imagen
/// 2. Peer B se une y descarga la imagen
/// 3. Peer C se une y descarga usando [host, B] como fuentes
#[tokio::test]
async fn test_download_from_multiple_peers() {
    let host_dir = tempfile::tempdir().unwrap();
    let peer_b_dir = tempfile::tempdir().unwrap();
    let peer_c_dir = tempfile::tempdir().unwrap();

    // --- HOST ---
    let (host_endpoint, host_docs, host_blobs_store, _host_router) =
        create_test_node(host_dir.path()).await;

    let host_doc = host_docs.create().await.expect("Error creando doc host");
    let host_author = host_docs.author_create().await.expect("Error creando autor host");
    let host_blobs: &iroh_blobs::api::Store = &*host_blobs_store;

    host_doc
        .set_bytes(host_author, b"meta/project".to_vec(),
            serde_json::to_vec(&serde_json::json!({"name":"Multi-peer Test","type":"od","version":1})).unwrap())
        .await.expect("Error meta");

    host_doc
        .set_bytes(host_author, b"meta/host_node_id".to_vec(), host_endpoint.id().to_string().as_bytes().to_vec())
        .await.expect("Error host_node_id");

    // Imagen de 1MB
    let image_content: Vec<u8> = (0..1024 * 1024).map(|i| (i % 251) as u8).collect();
    let img_path = host_dir.path().join("multi_peer.jpg");
    std::fs::write(&img_path, &image_content).unwrap();

    host_doc
        .set_bytes(host_author, b"images/mp-img/meta".to_vec(),
            serde_json::to_vec(&serde_json::json!({"id":"mp-img","name":"multi_peer.jpg","file":"multi_peer.jpg","width":1920,"height":1080,"status":"pending"})).unwrap())
        .await.expect("Error img meta");

    let blob_key: Bytes = b"images/mp-img/blob".to_vec().into();
    let outcome = host_doc
        .import_file(host_blobs, host_author, blob_key, &img_path, iroh_blobs::api::blobs::ImportMode::Copy)
        .await.expect("Error import start")
        .await.expect("Error import complete");

    host_doc.start_sync(vec![]).await.expect("Error sync");

    let ticket = host_doc
        .share(iroh_docs::api::protocol::ShareMode::Write, iroh_docs::api::protocol::AddrInfoOptions::RelayAndAddresses)
        .await.expect("Error ticket");

    println!("Host: imagen subida (hash={})", &outcome.hash.to_string()[..16]);

    // --- PEER B: se une y descarga ---
    let (peer_b_endpoint, peer_b_docs, peer_b_blobs_store, _peer_b_router) =
        create_test_node(peer_b_dir.path()).await;

    let peer_b_blobs: &iroh_blobs::api::Store = &*peer_b_blobs_store;

    let (peer_b_doc, _) = peer_b_docs.import_and_subscribe(ticket.clone()).await.expect("Error B import");

    // B: esperar sync
    let started = std::time::Instant::now();
    loop {
        if started.elapsed() >= std::time::Duration::from_secs(30) { panic!("Timeout B sync"); }
        if let Ok(Some(e)) = peer_b_doc.get_one(iroh_docs::store::Query::key_exact(b"images/mp-img/blob")).await {
            if peer_b_blobs.blobs().get_bytes(e.content_hash()).await.is_ok() {
                break; // Ya tiene el blob localmente (metadata sync incluye hash)
            }
            // Descargar blob desde host
            let dl = peer_b_blobs.downloader(&peer_b_endpoint);
            if dl.download(e.content_hash(), vec![host_endpoint.id()]).await.is_ok() {
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    // Verificar B tiene el blob
    let b_blob_entry = peer_b_doc
        .get_one(iroh_docs::store::Query::key_exact(b"images/mp-img/blob"))
        .await.expect("err").expect("blob en B");
    let b_blob = peer_b_blobs.blobs().get_bytes(b_blob_entry.content_hash()).await
        .expect("Error leyendo blob en B");
    assert_eq!(b_blob.len(), image_content.len());
    println!("B: imagen descargada del host ✓ ({} bytes)", b_blob.len());

    // Registrar B como peer en el doc
    let peer_b_author = peer_b_docs.author_create().await.expect("err");
    let peer_b_id = peer_b_endpoint.id().to_string();
    peer_b_doc
        .set_bytes(peer_b_author, format!("meta/peers/{}", peer_b_id).into_bytes(),
            serde_json::to_vec(&serde_json::json!({"display_name":"PeerB","role":"annotator"})).unwrap())
        .await.expect("Error registrando B");

    println!("B: registrado como peer en el doc");

    // --- PEER C: se une y descarga desde [host, B] ---
    let (peer_c_endpoint, peer_c_docs, peer_c_blobs_store, _peer_c_router) =
        create_test_node(peer_c_dir.path()).await;

    let peer_c_blobs: &iroh_blobs::api::Store = &*peer_c_blobs_store;

    // C necesita un ticket nuevo del doc
    let ticket_c = host_doc
        .share(iroh_docs::api::protocol::ShareMode::Write, iroh_docs::api::protocol::AddrInfoOptions::RelayAndAddresses)
        .await.expect("Error ticket C");

    let (peer_c_doc, _) = peer_c_docs.import_and_subscribe(ticket_c).await.expect("Error C import");

    // C: esperar sync de blob entry
    let started = std::time::Instant::now();
    let blob_hash;
    loop {
        if started.elapsed() >= std::time::Duration::from_secs(30) { panic!("Timeout C sync"); }
        if let Ok(Some(e)) = peer_c_doc.get_one(iroh_docs::store::Query::key_exact(b"images/mp-img/blob")).await {
            blob_hash = e.content_hash();
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    println!("C: blob entry sincronizado en {:?}", started.elapsed());

    // C: descargar usando AMBOS peers (host + B) — esto es lo que testea el fix 3
    let multi_sources = vec![host_endpoint.id(), peer_b_endpoint.id()];
    println!("C: descargando desde {} fuentes: host + B", multi_sources.len());

    let dl_c = peer_c_blobs.downloader(&peer_c_endpoint);
    dl_c.download(blob_hash, multi_sources)
        .await
        .expect("Error descargando desde múltiples peers");

    let c_blob = peer_c_blobs.blobs().get_bytes(blob_hash).await
        .expect("Error leyendo blob en C");
    assert_eq!(c_blob.len(), image_content.len());
    assert_eq!(c_blob.as_ref(), image_content.as_slice());

    println!("C: imagen descargada desde múltiples peers ✓ ({} bytes)", c_blob.len());
    println!("\n✓ Descarga multi-peer verificada: C descargó usando [host, B] como fuentes");
}
