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

    // Crear un archivo de prueba (simula una imagen)
    let test_file = tmp.path().join("test_image.png");
    let test_data = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]; // PNG header
    let test_data_extended: Vec<u8> = test_data.iter().chain(vec![0u8; 1024].iter()).copied().collect();
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

/// Test 2: Flujo completo host→colaborador
///
/// 1. Host crea un doc e importa una imagen (blob)
/// 2. Host genera ticket de compartir
/// 3. Colaborador importa el doc desde el ticket
/// 4. Colaborador descarga el blob del host
/// 5. Verificar que el contenido es idéntico
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

    // Crear imagen de prueba y importar como blob
    let test_image = host_dir.path().join("photo.jpg");
    let image_content: Vec<u8> = (0..2048).map(|i| (i % 256) as u8).collect();
    std::fs::write(&test_image, &image_content).unwrap();

    // Escribir image meta
    let img_meta = serde_json::json!({
        "id": "img-001",
        "name": "photo.jpg",
        "file": "photo.jpg",
        "width": 640,
        "height": 480,
        "status": "pending",
    });
    host_doc
        .set_bytes(
            host_author,
            b"images/img-001/meta".to_vec(),
            serde_json::to_vec(&img_meta).unwrap(),
        )
        .await
        .expect("Error escribiendo img meta");

    // Importar el blob de la imagen (CON doble-await)
    let blob_key: Bytes = b"images/img-001/blob".to_vec().into();
    let outcome = host_doc
        .import_file(
            host_blobs,
            host_author,
            blob_key,
            &test_image,
            iroh_blobs::api::blobs::ImportMode::Copy,
        )
        .await
        .expect("Error iniciando import")
        .await
        .expect("Error completando import");

    println!("Host: blob importado, hash={}, size={}", outcome.hash, outcome.size);

    // Iniciar sync en el host
    host_doc
        .start_sync(vec![])
        .await
        .expect("Error iniciando sync host");

    // Generar ticket para compartir
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

    // Importar doc desde ticket
    let (collab_doc, _events) = collab_docs
        .import_and_subscribe(ticket)
        .await
        .expect("Error importando doc");

    println!("Colaborador: doc importado, esperando sync...");

    // Esperar a que meta/project se sincronice (polling)
    let max_wait = std::time::Duration::from_secs(15);
    let started = std::time::Instant::now();
    loop {
        if started.elapsed() >= max_wait {
            panic!("Timeout esperando sync de meta/project");
        }
        match collab_doc
            .get_one(iroh_docs::store::Query::key_exact(b"meta/project"))
            .await
        {
            Ok(Some(entry)) => {
                if collab_blobs.blobs().get_bytes(entry.content_hash()).await.is_ok() {
                    println!("Colaborador: meta/project sincronizado en {:?}", started.elapsed());
                    break;
                }
            }
            _ => {}
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    // Verificar que la entrada del blob existe en el doc del colaborador
    let blob_entry = collab_doc
        .get_one(iroh_docs::store::Query::key_exact(b"images/img-001/blob"))
        .await
        .expect("Error buscando blob entry")
        .expect("El blob entry DEBE existir en el doc del colaborador");

    let blob_hash = blob_entry.content_hash();
    println!("Colaborador: blob entry encontrado, hash={}", blob_hash);

    // Descargar el blob desde el host
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
        let id_str = String::from_utf8_lossy(&bytes).to_string();
        id_str.parse().expect("Error parseando EndpointId")
    };

    let downloader = collab_blobs.downloader(&_collab_endpoint);
    downloader
        .download(blob_hash, vec![host_endpoint_id])
        .await
        .expect("Error descargando blob del host");

    // Leer el blob descargado
    let downloaded_content = collab_blobs
        .blobs()
        .get_bytes(blob_hash)
        .await
        .expect("Error leyendo blob descargado");

    // Verificar contenido
    assert_eq!(
        downloaded_content.len(),
        image_content.len(),
        "El tamaño del blob descargado debe coincidir"
    );
    assert_eq!(
        downloaded_content.as_ref(),
        image_content.as_slice(),
        "El contenido del blob descargado debe ser idéntico al original"
    );

    println!("✓ Transferencia host→colaborador exitosa: {} bytes", downloaded_content.len());
}
