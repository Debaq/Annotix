//! Banco de tests de integración para sistemas principales.
//!
//! Cubre:
//! - Serialización/deserialización de `ProjectFile` (roundtrip JSON)
//! - IO atómico (`store::io::{read_project, write_project}`)
//! - Parsers comunes de `export` (bbox / polygon / keypoints / landmarks / mask)
//! - Roundtrip export→import para YOLO (detection + segmentation), COCO y Pascal VOC
//! - Normalización de nombres WebP → JPG y transcodificación
//!
//! No depende de Tauri ni de `AppState`: las tests operan sobre los módulos internos
//! que reciben `std::fs::File` / `ZipArchive<File>` directamente, usando `tempfile::TempDir`.

use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use image::{ImageBuffer, Rgb};
use serde_json::json;
use tempfile::TempDir;
use zip::ZipArchive;

use crate::export;
use crate::import;
use crate::store::io as store_io;
use crate::store::project_file::{AnnotationEntry, ClassDef, ImageEntry, ProjectFile};

// ─── Helpers ────────────────────────────────────────────────────────────────

fn make_png_bytes(w: u32, h: u32, r: u8, g: u8, b: u8) -> Vec<u8> {
    let img: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_fn(w, h, |_, _| Rgb([r, g, b]));
    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
        .expect("encode png");
    buf
}

fn write_png(dir: &Path, name: &str, w: u32, h: u32) -> PathBuf {
    let p = dir.join(name);
    fs::write(&p, make_png_bytes(w, h, 128, 64, 200)).expect("write png");
    p
}

fn bbox_ann(class_id: i64, x: f64, y: f64, w: f64, h: f64) -> AnnotationEntry {
    AnnotationEntry {
        id: uuid::Uuid::new_v4().to_string(),
        annotation_type: "bbox".into(),
        class_id,
        data: json!({ "x": x, "y": y, "width": w, "height": h }),
        source: "user".into(),
        confidence: None,
        model_class_name: None,
        created_by: None,
        track_id: None,
    }
}

#[allow(dead_code)]
fn polygon_ann(class_id: i64, pts: &[(f64, f64)]) -> AnnotationEntry {
    let points: Vec<_> = pts.iter().map(|(x, y)| json!({"x": x, "y": y})).collect();
    AnnotationEntry {
        id: uuid::Uuid::new_v4().to_string(),
        annotation_type: "polygon".into(),
        class_id,
        data: json!({ "points": points, "closed": true }),
        source: "user".into(),
        confidence: None,
        model_class_name: None,
        created_by: None,
        track_id: None,
    }
}

fn make_project(name: &str, ptype: &str, classes: Vec<ClassDef>) -> ProjectFile {
    ProjectFile {
        version: 1,
        id: uuid::Uuid::new_v4().to_string(),
        name: name.into(),
        project_type: ptype.into(),
        classes,
        created: 0.0,
        updated: 0.0,
        images: vec![],
        timeseries: vec![],
        videos: vec![],
        training_jobs: vec![],
        tabular_data: vec![],
        audio: vec![],
        p2p: None,
        p2p_download: None,
        inference_models: vec![],
        folder: None,
        tts_sentences: vec![],
        image_format: "jpg".into(),
        webp_quality_preset: "high".into(),
    }
}

fn image_entry(name: &str, file: &str, w: u32, h: u32, anns: Vec<AnnotationEntry>) -> ImageEntry {
    ImageEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.into(),
        file: file.into(),
        width: w,
        height: h,
        uploaded: 0.0,
        annotated: Some(1.0),
        status: "annotated".into(),
        annotations: anns,
        video_id: None,
        frame_index: None,
        is_background: false,
        locked_by: None,
        lock_expires: None,
        download_status: None,
        predictions: vec![],
    }
}

fn default_classes() -> Vec<ClassDef> {
    vec![
        ClassDef {
            id: 0,
            name: "cat".into(),
            color: "#ff0000".into(),
            description: None,
        },
        ClassDef {
            id: 1,
            name: "dog".into(),
            color: "#00ff00".into(),
            description: Some("puppy".into()),
        },
    ]
}

/// Construye un proyecto "detection" con 2 imágenes reales en disco.
/// Devuelve (project, images_dir_tempdir).
fn build_detection_fixture() -> (ProjectFile, TempDir) {
    let tmp = tempfile::tempdir().expect("tmpdir");
    write_png(tmp.path(), "img1.png", 200, 100);
    write_png(tmp.path(), "img2.png", 200, 100);

    let mut pf = make_project("test", "detection", default_classes());
    pf.images = vec![
        image_entry(
            "img1.png",
            "img1.png",
            200,
            100,
            vec![bbox_ann(0, 10.0, 20.0, 50.0, 40.0)],
        ),
        image_entry(
            "img2.png",
            "img2.png",
            200,
            100,
            vec![
                bbox_ann(0, 5.0, 5.0, 20.0, 20.0),
                bbox_ann(1, 100.0, 50.0, 60.0, 30.0),
            ],
        ),
    ];
    (pf, tmp)
}

// ─── Tests: ProjectFile JSON roundtrip ──────────────────────────────────────

#[test]
fn project_file_roundtrip_json_preserves_data() {
    let mut pf = make_project("p", "detection", default_classes());
    pf.images = vec![image_entry(
        "a.png",
        "a.png",
        640,
        480,
        vec![bbox_ann(1, 1.0, 2.0, 3.0, 4.0)],
    )];

    let s = serde_json::to_string(&pf).expect("ser");
    let back: ProjectFile = serde_json::from_str(&s).expect("deser");

    assert_eq!(back.name, "p");
    assert_eq!(back.project_type, "detection");
    assert_eq!(back.classes.len(), 2);
    assert_eq!(back.images.len(), 1);
    assert_eq!(back.images[0].annotations.len(), 1);
    assert_eq!(back.images[0].annotations[0].class_id, 1);
    assert_eq!(back.image_format, "jpg");
}

#[test]
fn project_file_default_image_format_is_jpg() {
    // JSON sin campo imageFormat → default "jpg"
    let minimal = json!({
        "version": 1,
        "id": "x",
        "name": "n",
        "type": "detection",
        "classes": [],
        "created": 0.0,
        "updated": 0.0,
    });
    let pf: ProjectFile = serde_json::from_value(minimal).expect("deser");
    assert_eq!(pf.image_format, "jpg");
}

// ─── Tests: store::io ───────────────────────────────────────────────────────

#[test]
fn io_write_then_read_roundtrip() {
    let tmp = tempfile::tempdir().unwrap();
    let pf = make_project("p", "detection", default_classes());

    store_io::write_project(tmp.path(), &pf).expect("write");
    let back = store_io::read_project(tmp.path()).expect("read");

    assert_eq!(back.id, pf.id);
    assert_eq!(back.classes.len(), pf.classes.len());
}

#[test]
fn io_write_is_atomic_leaves_no_tmp() {
    let tmp = tempfile::tempdir().unwrap();
    let pf = make_project("p", "detection", vec![]);
    store_io::write_project(tmp.path(), &pf).expect("write");

    assert!(tmp.path().join("project.json").exists());
    assert!(!tmp.path().join("project.json.tmp").exists());
}

#[test]
fn io_read_missing_project_returns_error() {
    let tmp = tempfile::tempdir().unwrap();
    let err = store_io::read_project(tmp.path());
    assert!(err.is_err());
}

// ─── Tests: export parsers ──────────────────────────────────────────────────

#[test]
fn parse_bbox_valid() {
    let d = json!({"x": 1.0, "y": 2.0, "width": 3.0, "height": 4.0});
    let b = export::parse_bbox(&d).expect("parse");
    assert_eq!(b.x, 1.0);
    assert_eq!(b.width, 3.0);
}

#[test]
fn parse_bbox_missing_field_returns_none() {
    let d = json!({"x": 1.0, "y": 2.0, "width": 3.0});
    assert!(export::parse_bbox(&d).is_none());
}

#[test]
fn parse_polygon_requires_3_points() {
    let d = json!({"points": [{"x":0.0,"y":0.0},{"x":1.0,"y":1.0}]});
    assert!(export::parse_polygon(&d).is_none());

    let d = json!({"points": [{"x":0.0,"y":0.0},{"x":1.0,"y":0.0},{"x":1.0,"y":1.0}]});
    let p = export::parse_polygon(&d).expect("parse");
    assert_eq!(p.points.len(), 3);
}

#[test]
fn parse_obb_accepts_cx_cy_aliases() {
    let d = json!({"cx": 10.0, "cy": 20.0, "width": 5.0, "height": 5.0, "angle": 45.0});
    let o = export::parse_obb(&d).expect("parse");
    assert_eq!(o.x, 10.0);
    assert_eq!(o.rotation, 45.0);
}

#[test]
fn class_name_lookup() {
    let cs = default_classes();
    assert_eq!(export::class_name(&cs, 0), "cat");
    assert_eq!(export::class_name(&cs, 99), "unknown");
}

// ─── Tests: WebP → JPG helpers ──────────────────────────────────────────────

#[test]
fn has_webp_ext_case_insensitive() {
    assert!(export::has_webp_ext("foo.webp"));
    assert!(export::has_webp_ext("foo.WEBP"));
    assert!(!export::has_webp_ext("foo.png"));
}

#[test]
fn replace_webp_with_jpg_preserves_stem() {
    assert_eq!(export::replace_webp_with_jpg("foo.webp"), "foo.jpg");
    assert_eq!(export::replace_webp_with_jpg("bar.baz.WEBP"), "bar.baz.jpg");
    assert_eq!(export::replace_webp_with_jpg("noext"), "noext.jpg");
}

#[test]
fn normalize_image_names_rewrites_webp_only() {
    let imgs = vec![
        image_entry("a.webp", "a.webp", 10, 10, vec![]),
        image_entry("b.png", "b.png", 10, 10, vec![]),
    ];
    let out = export::normalize_image_names_to_jpg(&imgs);
    assert_eq!(out[0].name, "a.jpg");
    assert_eq!(out[0].file, "a.webp"); // file no cambia
    assert_eq!(out[1].name, "b.png");
}

#[test]
fn transcode_png_to_jpg_produces_valid_jpg() {
    let png = make_png_bytes(32, 32, 10, 20, 30);
    let jpg = export::transcode_to_jpg(&png).expect("transcode");
    // JPG magic number: FF D8 FF
    assert!(jpg.len() > 3);
    assert_eq!(&jpg[..3], &[0xFF, 0xD8, 0xFF]);
    // Decoder acepta el resultado
    let decoded = image::load_from_memory(&jpg).expect("decode");
    assert_eq!(decoded.width(), 32);
    assert_eq!(decoded.height(), 32);
}

// ─── Tests: roundtrip YOLO detection ────────────────────────────────────────

fn open_zip(path: &Path) -> ZipArchive<std::fs::File> {
    let f = std::fs::File::open(path).expect("open zip");
    ZipArchive::new(f).expect("zip archive")
}

fn export_and_reopen<F>(images_dir: &Path, exporter: F) -> (PathBuf, TempDir)
where
    F: FnOnce(std::fs::File),
{
    let out_dir = tempfile::tempdir().unwrap();
    let zip_path = out_dir.path().join("out.zip");
    let file = std::fs::File::create(&zip_path).expect("create zip");
    exporter(file);
    let _ = images_dir; // keep lifetime explicit, not used directly here
    (zip_path, out_dir)
}

#[test]
fn yolo_detection_roundtrip_preserves_bboxes() {
    let (pf, imgs_dir) = build_detection_fixture();

    let (zip_path, _out) = export_and_reopen(imgs_dir.path(), |file| {
        export::yolo::export(&pf, &pf.images, imgs_dir.path(), file, false, |_| {})
            .expect("export");
    });

    let mut archive = open_zip(&zip_path);
    let data = import::yolo::import_data(&mut archive, "detection", false).expect("import");

    assert_eq!(data.classes.len(), 2);
    assert_eq!(data.classes[0].name, "cat");
    assert_eq!(data.classes[1].name, "dog");
    assert_eq!(data.images.len(), 2);

    let total_anns: usize = data.images.iter().map(|i| i.annotations.len()).sum();
    assert_eq!(total_anns, 3);

    // Verificar que los bboxes están aproximadamente en la ubicación original
    let img1 = data
        .images
        .iter()
        .find(|i| i.name == "img1.png")
        .expect("img1");
    assert_eq!(img1.annotations.len(), 1);
    let ann = &img1.annotations[0];
    assert_eq!(ann.class_id, 0);
    let x = ann.data["x"].as_f64().unwrap();
    let w = ann.data["width"].as_f64().unwrap();
    assert!((x - 10.0).abs() < 1.0, "x was {}", x);
    assert!((w - 50.0).abs() < 1.0, "w was {}", w);
}

#[test]
fn yolo_detection_label_format_is_cx_cy_w_h_normalized() {
    // Inspección directa del contenido del txt: class_id xc yc w h normalizados
    let (pf, imgs_dir) = build_detection_fixture();
    let out = tempfile::tempdir().unwrap();
    let zip_path = out.path().join("o.zip");
    let file = std::fs::File::create(&zip_path).unwrap();
    export::yolo::export(&pf, &pf.images, imgs_dir.path(), file, false, |_| {}).unwrap();

    let mut archive = open_zip(&zip_path);
    let txt = import::yolo::read_zip_text(&mut archive, "labels/img1.txt").expect("read txt");
    let parts: Vec<&str> = txt.split_whitespace().collect();
    assert_eq!(parts.len(), 5);
    assert_eq!(parts[0], "0"); // class_id
                               // xc normalizado: (10 + 50/2) / 200 = 35/200 = 0.175
    let xc: f64 = parts[1].parse().unwrap();
    assert!((xc - 0.175).abs() < 1e-4, "xc was {}", xc);
}

// Nota: YOLO export no escribe polígonos (solo bbox/obb). El import SÍ parsea
// polígonos si is_segmentation=true. Por eso el roundtrip polígono→polígono no
// es posible con los módulos actuales.

// ─── Tests: roundtrip COCO ──────────────────────────────────────────────────

#[test]
fn coco_roundtrip_preserves_bboxes_and_classes() {
    let (pf, imgs_dir) = build_detection_fixture();

    let out = tempfile::tempdir().unwrap();
    let zip_path = out.path().join("coco.zip");
    let file = std::fs::File::create(&zip_path).unwrap();
    export::coco::export(&pf, &pf.images, imgs_dir.path(), file, |_| {}).expect("export");

    let mut archive = open_zip(&zip_path);
    let data = import::coco::import_data(&mut archive, "detection").expect("import");

    assert_eq!(data.classes.len(), 2);
    assert_eq!(data.images.len(), 2);
    let total_anns: usize = data.images.iter().map(|i| i.annotations.len()).sum();
    assert_eq!(total_anns, 3);
}

#[test]
fn coco_annotations_json_is_valid_coco_schema() {
    let (pf, imgs_dir) = build_detection_fixture();

    let out = tempfile::tempdir().unwrap();
    let zip_path = out.path().join("coco.zip");
    let file = std::fs::File::create(&zip_path).unwrap();
    export::coco::export(&pf, &pf.images, imgs_dir.path(), file, |_| {}).unwrap();

    let mut archive = open_zip(&zip_path);
    let json_txt = import::yolo::read_zip_text(&mut archive, "annotations.json").expect("read");
    let v: serde_json::Value = serde_json::from_str(&json_txt).expect("parse");
    assert!(v.get("images").and_then(|x| x.as_array()).is_some());
    assert!(v.get("annotations").and_then(|x| x.as_array()).is_some());
    assert!(v.get("categories").and_then(|x| x.as_array()).is_some());
}

// ─── Tests: roundtrip Pascal VOC ────────────────────────────────────────────

#[test]
fn pascal_voc_roundtrip_preserves_bboxes() {
    let (pf, imgs_dir) = build_detection_fixture();

    let out = tempfile::tempdir().unwrap();
    let zip_path = out.path().join("voc.zip");
    let file = std::fs::File::create(&zip_path).unwrap();
    export::pascal_voc::export(&pf, &pf.images, imgs_dir.path(), file, |_| {}).expect("export");

    let mut archive = open_zip(&zip_path);
    let data = import::pascal_voc::import_data(&mut archive).expect("import");

    assert_eq!(data.classes.len(), 2);
    assert_eq!(data.images.len(), 2);
    let total_anns: usize = data.images.iter().map(|i| i.annotations.len()).sum();
    assert_eq!(total_anns, 3);
}

// ─── Tests: export rechaza proyectos sin imágenes anotadas ──────────────────

#[test]
fn yolo_export_with_empty_images_writes_only_metadata() {
    // Cuando no hay imágenes, sólo se escriben classes.txt y data.yaml.
    let pf = make_project("empty", "detection", default_classes());
    let imgs_dir = tempfile::tempdir().unwrap();
    let out = tempfile::tempdir().unwrap();
    let zip_path = out.path().join("e.zip");
    let file = std::fs::File::create(&zip_path).unwrap();
    export::yolo::export(&pf, &pf.images, imgs_dir.path(), file, false, |_| {}).expect("export");

    let mut archive = open_zip(&zip_path);
    assert!(import::yolo::read_zip_text(&mut archive, "classes.txt").is_ok());
    assert!(import::yolo::read_zip_text(&mut archive, "data.yaml").is_ok());
}

// ─── Tests: import detecta formato ──────────────────────────────────────────

#[test]
fn detect_format_recognizes_yolo() {
    let (pf, imgs_dir) = build_detection_fixture();
    let out = tempfile::tempdir().unwrap();
    let zip_path = out.path().join("yolo.zip");
    let file = std::fs::File::create(&zip_path).unwrap();
    export::yolo::export(&pf, &pf.images, imgs_dir.path(), file, false, |_| {}).unwrap();

    let det = import::detect_format(zip_path.to_str().unwrap()).expect("detect");
    assert!(det.format.starts_with("yolo"), "got {}", det.format);
}

#[test]
fn detect_format_recognizes_coco() {
    let (pf, imgs_dir) = build_detection_fixture();
    let out = tempfile::tempdir().unwrap();
    let zip_path = out.path().join("coco.zip");
    let file = std::fs::File::create(&zip_path).unwrap();
    export::coco::export(&pf, &pf.images, imgs_dir.path(), file, |_| {}).unwrap();

    let det = import::detect_format(zip_path.to_str().unwrap()).expect("detect");
    assert_eq!(det.format, "coco");
}

// ════════════════════════════════════════════════════════════════════════════
// P2P — roles, reglas, gossip, estados
// ════════════════════════════════════════════════════════════════════════════

use crate::p2p::{
    protocol::GossipMessage, ApprovalStatus, LockMode, PeerRole, SessionRules, SessionStatus,
};

// ─── PeerRole: permisos ─────────────────────────────────────────────────────

#[test]
fn peer_role_lead_researcher_has_all_permissions() {
    let r = PeerRole::LeadResearcher;
    assert!(r.can_manage());
    assert!(r.can_annotate());
    assert!(r.can_upload_data());
    assert!(r.can_export());
}

#[test]
fn peer_role_annotator_only_annotates() {
    let r = PeerRole::Annotator;
    assert!(!r.can_manage());
    assert!(r.can_annotate());
    assert!(!r.can_upload_data());
    assert!(!r.can_export());
}

#[test]
fn peer_role_data_curator_uploads_and_exports_but_no_annotate() {
    let r = PeerRole::DataCurator;
    assert!(!r.can_manage());
    assert!(!r.can_annotate());
    assert!(r.can_upload_data());
    assert!(r.can_export());
}

#[test]
fn peer_role_display_strings() {
    assert_eq!(PeerRole::LeadResearcher.to_string(), "lead_researcher");
    assert_eq!(PeerRole::Annotator.to_string(), "annotator");
    assert_eq!(PeerRole::DataCurator.to_string(), "data_curator");
}

#[test]
fn peer_role_serde_uses_snake_case() {
    let r = PeerRole::LeadResearcher;
    let s = serde_json::to_string(&r).unwrap();
    assert_eq!(s, "\"lead_researcher\"");
}

#[test]
fn peer_role_serde_legacy_aliases() {
    // Valores antiguos del schema P2P: "host" → LeadResearcher, "collaborator" → Annotator
    let r: PeerRole = serde_json::from_str("\"host\"").unwrap();
    assert_eq!(r, PeerRole::LeadResearcher);
    let r: PeerRole = serde_json::from_str("\"collaborator\"").unwrap();
    assert_eq!(r, PeerRole::Annotator);
}

// ─── LockMode ───────────────────────────────────────────────────────────────

#[test]
fn lock_mode_from_str_lossy_defaults_to_individual() {
    assert_eq!(LockMode::from_str_lossy("batch"), LockMode::Batch);
    assert_eq!(LockMode::from_str_lossy("individual"), LockMode::Individual);
    assert_eq!(LockMode::from_str_lossy("unknown"), LockMode::Individual);
    assert_eq!(LockMode::from_str_lossy(""), LockMode::Individual);
}

#[test]
fn lock_mode_serde_lowercase() {
    let s = serde_json::to_string(&LockMode::Batch).unwrap();
    assert_eq!(s, "\"batch\"");
    let m: LockMode = serde_json::from_str("\"individual\"").unwrap();
    assert_eq!(m, LockMode::Individual);
}

// ─── SessionRules ───────────────────────────────────────────────────────────

#[test]
fn session_rules_default_restrictive_except_export() {
    let r = SessionRules::default();
    assert_eq!(r.lock_mode, LockMode::Individual);
    assert!(!r.can_upload);
    assert!(!r.can_edit_classes);
    assert!(!r.can_delete);
    assert!(r.can_export);
    assert!(!r.require_data_approval);
}

#[test]
fn session_rules_serde_camel_case() {
    let r = SessionRules::default();
    let v = serde_json::to_value(&r).unwrap();
    assert!(v.get("lockMode").is_some());
    assert!(v.get("canUpload").is_some());
    assert!(v.get("canEditClasses").is_some());
    assert!(v.get("requireDataApproval").is_some());
}

#[test]
fn session_rules_deserialize_without_require_data_approval() {
    // Campo con #[serde(default)] — proyectos antiguos no lo traían
    let v = json!({
        "lockMode": "individual",
        "canUpload": true,
        "canEditClasses": false,
        "canDelete": false,
        "canExport": true,
    });
    let r: SessionRules = serde_json::from_value(v).unwrap();
    assert!(!r.require_data_approval);
    assert!(r.can_upload);
}

// ─── SessionStatus / ApprovalStatus ─────────────────────────────────────────

#[test]
fn session_status_serde_lowercase() {
    assert_eq!(
        serde_json::to_string(&SessionStatus::Connected).unwrap(),
        "\"connected\""
    );
    let s: SessionStatus = serde_json::from_str("\"syncing\"").unwrap();
    assert_eq!(s, SessionStatus::Syncing);
}

#[test]
fn approval_status_serde_lowercase() {
    assert_eq!(
        serde_json::to_string(&ApprovalStatus::Pending).unwrap(),
        "\"pending\""
    );
    let s: ApprovalStatus = serde_json::from_str("\"rejected\"").unwrap();
    assert_eq!(s, ApprovalStatus::Rejected);
}

// ─── GossipMessage: roundtrip en bytes ──────────────────────────────────────

#[test]
fn gossip_message_peer_joined_roundtrip() {
    let m = GossipMessage::PeerJoined {
        node_id: "node-1".into(),
        display_name: "Alice".into(),
    };
    let bytes = m.to_bytes().expect("ser");
    let back = GossipMessage::from_bytes(&bytes).expect("deser");
    match back {
        GossipMessage::PeerJoined {
            node_id,
            display_name,
        } => {
            assert_eq!(node_id, "node-1");
            assert_eq!(display_name, "Alice");
        }
        other => panic!("variante inesperada: {:?}", other),
    }
}

#[test]
fn gossip_message_image_locked_roundtrip() {
    let m = GossipMessage::ImageLocked {
        image_id: "img-42".into(),
        by: "node-a".into(),
        by_name: "Alice".into(),
    };
    let bytes = m.to_bytes().unwrap();
    let back = GossipMessage::from_bytes(&bytes).unwrap();
    assert!(matches!(back, GossipMessage::ImageLocked { .. }));
}

#[test]
fn gossip_message_batch_assigned_preserves_ids() {
    let m = GossipMessage::BatchAssigned {
        batch_id: "b1".into(),
        image_ids: vec!["a".into(), "b".into(), "c".into()],
        to: "n2".into(),
        to_name: "Bob".into(),
    };
    let bytes = m.to_bytes().unwrap();
    let back = GossipMessage::from_bytes(&bytes).unwrap();
    match back {
        GossipMessage::BatchAssigned { image_ids, .. } => {
            assert_eq!(image_ids, vec!["a", "b", "c"]);
        }
        _ => panic!("variante inesperada"),
    }
}

#[test]
fn gossip_message_uses_type_tag_and_camel_case_keys() {
    // Validar contrato en el wire: { "type": "PeerJoined", "nodeId": "...", ... }
    let m = GossipMessage::PeerJoined {
        node_id: "n".into(),
        display_name: "d".into(),
    };
    let v: serde_json::Value = serde_json::from_slice(&m.to_bytes().unwrap()).unwrap();
    assert_eq!(v["type"], "PeerJoined");
    assert_eq!(v["nodeId"], "n");
    assert_eq!(v["displayName"], "d");
}

#[test]
fn gossip_message_rejects_invalid_bytes() {
    assert!(GossipMessage::from_bytes(b"not json").is_err());
    assert!(GossipMessage::from_bytes(b"{\"type\":\"UnknownType\"}").is_err());
}

// ─── P2P ticket: detección de host key ──────────────────────────────────────

#[test]
fn ticket_is_host_key_detection() {
    assert!(crate::p2p::ticket::is_host_key("ANN-HOST-AAAA-BBBB"));
    assert!(crate::p2p::ticket::is_host_key("  ann-host-xxxx  ")); // trim + uppercase
    assert!(!crate::p2p::ticket::is_host_key("ANN-AAAA-BBBB"));
    assert!(!crate::p2p::ticket::is_host_key(""));
}

#[test]
fn ticket_decode_share_code_rejects_bad_prefix() {
    let e = crate::p2p::ticket::decode_share_code("XYZ-1234");
    assert!(e.is_err());
}

#[test]
fn ticket_decode_host_key_rejects_non_host_prefix() {
    let e = crate::p2p::ticket::decode_host_key("ANN-1234");
    assert!(e.is_err());
}

// ════════════════════════════════════════════════════════════════════════════
// Inference — OutputFormat y helpers
// ════════════════════════════════════════════════════════════════════════════

use crate::inference::infer_annotation_type;
use crate::inference::ort_runner::OutputFormat;

#[test]
fn output_format_from_hint_yolov8_family() {
    let aliases = ["yolov8", "v8", "yolo8", "yolov9", "v11", "yolov12"];
    for a in aliases {
        assert_eq!(
            OutputFormat::from_hint(a),
            Some(OutputFormat::YoloV8),
            "alias {}",
            a
        );
    }
}

#[test]
fn output_format_from_hint_yolov5_family() {
    assert_eq!(
        OutputFormat::from_hint("yolov5"),
        Some(OutputFormat::YoloV5)
    );
    assert_eq!(
        OutputFormat::from_hint("yolov7"),
        Some(OutputFormat::YoloV5)
    );
}

#[test]
fn output_format_from_hint_yolov10_family() {
    assert_eq!(
        OutputFormat::from_hint("yolov10"),
        Some(OutputFormat::YoloV10)
    );
    assert_eq!(
        OutputFormat::from_hint("yolo26"),
        Some(OutputFormat::YoloV10)
    );
}

#[test]
fn output_format_from_hint_normalizes_separators() {
    assert_eq!(
        OutputFormat::from_hint("YOLO-V8"),
        Some(OutputFormat::YoloV8)
    );
    assert_eq!(
        OutputFormat::from_hint("Yolo_V5"),
        Some(OutputFormat::YoloV5)
    );
}

#[test]
fn output_format_from_hint_multi_output_aliases() {
    for a in [
        "ssd",
        "efficientdet",
        "fasterrcnn",
        "rcnn",
        "retinanet",
        "detr",
    ] {
        assert_eq!(
            OutputFormat::from_hint(a),
            Some(OutputFormat::MultiOutput),
            "alias {}",
            a
        );
    }
}

#[test]
fn output_format_from_hint_classification() {
    assert_eq!(
        OutputFormat::from_hint("classification"),
        Some(OutputFormat::Classification)
    );
    assert_eq!(
        OutputFormat::from_hint("cls"),
        Some(OutputFormat::Classification)
    );
}

#[test]
fn output_format_from_hint_unknown_returns_none() {
    assert_eq!(OutputFormat::from_hint("foo"), None);
    assert_eq!(OutputFormat::from_hint(""), None);
}

#[test]
fn output_format_label_is_human_readable() {
    assert!(OutputFormat::YoloV8.label().contains("YOLOv8"));
    assert!(OutputFormat::YoloV10.label().contains("end-to-end"));
    assert!(!OutputFormat::Classification.label().is_empty());
}

#[test]
fn infer_annotation_type_detects_polygon() {
    let d = json!({"points": [{"x":0.0,"y":0.0}]});
    assert_eq!(infer_annotation_type(&d), "polygon");
}

#[test]
fn infer_annotation_type_detects_obb() {
    let d = json!({"x":1.0,"y":2.0,"width":3.0,"height":4.0,"angle":45.0});
    assert_eq!(infer_annotation_type(&d), "obb");
}

#[test]
fn infer_annotation_type_defaults_to_bbox() {
    let d = json!({"x":1.0,"y":2.0,"width":3.0,"height":4.0});
    assert_eq!(infer_annotation_type(&d), "bbox");
}

// ════════════════════════════════════════════════════════════════════════════
// Training — dataset prep
// ════════════════════════════════════════════════════════════════════════════

use crate::training::dataset;

#[test]
fn training_prepare_dataset_creates_yolo_structure() {
    let (pf, imgs_dir) = build_detection_fixture();
    let out = tempfile::tempdir().unwrap();

    let prepared = dataset::prepare_dataset(
        imgs_dir.path(),
        &pf,
        &pf.images,
        out.path(),
        0.5,
        0.0,
        "detect",
    )
    .expect("prepare");
    let yaml_path = prepared
        .abs(crate::training::contract::keys::DATA_YAML)
        .expect("data.yaml declarado");

    assert!(yaml_path.exists());
    assert!(out.path().join("images/train").exists());
    assert!(out.path().join("images/val").exists());
    assert!(out.path().join("labels/train").exists());
    assert!(out.path().join("labels/val").exists());

    // yaml válido: contiene nc, names, path
    let yaml = std::fs::read_to_string(&yaml_path).unwrap();
    assert!(yaml.contains("nc: 2"));
    assert!(yaml.contains("cat"));
    assert!(yaml.contains("dog"));
    assert!(yaml.contains("train: images/train"));
}

#[test]
fn training_prepare_dataset_empty_images_errors() {
    let tmp = tempfile::tempdir().unwrap();
    let out = tempfile::tempdir().unwrap();
    let pf = make_project("p", "detection", default_classes());
    let e = dataset::prepare_dataset(tmp.path(), &pf, &[], out.path(), 0.2, 0.0, "detect");
    assert!(e.is_err());
}

#[test]
fn training_prepare_dataset_classify_uses_folders_by_class() {
    let (pf, imgs_dir) = build_detection_fixture();
    let out = tempfile::tempdir().unwrap();

    // Para classify, las anotaciones deben ser bbox con class_id válido; el primer bbox
    // determina la clase. Nuestra fixture tiene eso.
    let prepared = dataset::prepare_dataset(
        imgs_dir.path(),
        &pf,
        &pf.images,
        out.path(),
        0.5,
        0.0,
        "classify",
    )
    .expect("prepare classify");
    let yaml_path = prepared
        .abs(crate::training::contract::keys::DATA_YAML)
        .expect("data.yaml declarado");

    // Estructura: {split}/{class_name}/*.png
    assert!(out.path().join("train/cat").exists() || out.path().join("val/cat").exists());
    assert!(out.path().join("train/dog").exists() || out.path().join("val/dog").exists());

    let yaml = std::fs::read_to_string(&yaml_path).unwrap();
    assert!(yaml.contains("train: train"));
    assert!(yaml.contains("val: val"));
}

#[test]
fn training_prepare_dataset_is_deterministic_per_project_id() {
    // Mismo project.id → misma partición (seed basado en bytes del UUID)
    let (pf, imgs_dir) = build_detection_fixture();

    let out1 = tempfile::tempdir().unwrap();
    dataset::prepare_dataset(
        imgs_dir.path(),
        &pf,
        &pf.images,
        out1.path(),
        0.5,
        0.0,
        "detect",
    )
    .unwrap();
    let files1: Vec<_> = std::fs::read_dir(out1.path().join("images/train"))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .collect();

    let out2 = tempfile::tempdir().unwrap();
    dataset::prepare_dataset(
        imgs_dir.path(),
        &pf,
        &pf.images,
        out2.path(),
        0.5,
        0.0,
        "detect",
    )
    .unwrap();
    let files2: Vec<_> = std::fs::read_dir(out2.path().join("images/train"))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .collect();

    let mut f1 = files1.clone();
    let mut f2 = files2.clone();
    f1.sort();
    f2.sort();
    assert_eq!(f1, f2, "split debería ser determinístico por project.id");
}

// ─── Tests: split agrupado por unidad natural ───────────────────────────────

/// Imagen que es un fotograma de un video, como la deja la extracción.
fn frame_entry(video_id: &str, idx: i64) -> ImageEntry {
    let mut img = image_entry(
        &format!("{}_f{}.png", video_id, idx),
        &format!("{}_f{}.png", video_id, idx),
        200,
        100,
        vec![bbox_ann(0, 10.0, 20.0, 50.0, 40.0)],
    );
    img.video_id = Some(video_id.to_string());
    img.frame_index = Some(idx);
    img
}

#[test]
fn split_agrupado_no_parte_un_video_entre_particiones() {
    // Tres videos de 6 fotogramas y dos imágenes sueltas. Antes de agrupar, los
    // fotogramas vecinos —casi idénticos entre sí— caían en train y val a la vez,
    // y la validación medía memoria en vez de generalización.
    let mut pf = make_project("p", "detection", default_classes());
    for vid in ["vidA", "vidB", "vidC"] {
        for i in 0..6 {
            pf.images.push(frame_entry(vid, i));
        }
    }
    pf.images.push(image_entry(
        "solo1.png",
        "solo1.png",
        200,
        100,
        vec![bbox_ann(0, 1.0, 1.0, 5.0, 5.0)],
    ));
    pf.images.push(image_entry(
        "solo2.png",
        "solo2.png",
        200,
        100,
        vec![bbox_ann(0, 1.0, 1.0, 5.0, 5.0)],
    ));

    let plan = dataset::split_plan(&pf, &pf.images, 0.25, 0.25);

    let videos_de = |indices: &[usize]| -> std::collections::HashSet<String> {
        indices
            .iter()
            .filter_map(|&i| pf.images[i].video_id.clone())
            .collect()
    };
    let t = videos_de(&plan.train);
    let v = videos_de(&plan.val);
    let s = videos_de(&plan.test);

    assert!(
        t.is_disjoint(&v),
        "un video quedó en train y val: {t:?} vs {v:?}"
    );
    assert!(
        t.is_disjoint(&s),
        "un video quedó en train y test: {t:?} vs {s:?}"
    );
    assert!(
        v.is_disjoint(&s),
        "un video quedó en val y test: {v:?} vs {s:?}"
    );

    // Ninguna imagen se pierde ni se duplica.
    let mut todos: Vec<usize> = plan
        .train
        .iter()
        .chain(plan.val.iter())
        .chain(plan.test.iter())
        .copied()
        .collect();
    todos.sort_unstable();
    let esperado: Vec<usize> = (0..pf.images.len()).collect();
    assert_eq!(todos, esperado, "el reparto perdió o duplicó imágenes");
}

#[test]
fn split_sin_grupos_reparte_igual_que_el_corte_por_indice() {
    // Regresión: en un proyecto de imágenes sueltas el reparto agrupado tiene que
    // dar exactamente lo que daba el corte por índice, o cambiaría el split de
    // todo proyecto existente sin motivo.
    let mut pf = make_project("p", "detection", default_classes());
    for i in 0..11 {
        pf.images.push(image_entry(
            &format!("img{i}.png"),
            &format!("img{i}.png"),
            200,
            100,
            vec![bbox_ann(0, 1.0, 1.0, 5.0, 5.0)],
        ));
    }
    let total = pf.images.len();

    // Reimplementación literal del reparto anterior, como referencia.
    let mut indices: Vec<usize> = (0..total).collect();
    let seed = pf.id.bytes().fold(42usize, |acc, b| {
        acc.wrapping_mul(31).wrapping_add(b as usize)
    });
    for i in (1..indices.len()).rev() {
        let j = (seed.wrapping_mul(i).wrapping_add(7)) % (i + 1);
        indices.swap(i, j);
    }
    let counts = dataset::compute_split(total, 0.2, 0.2);
    let val_end = counts.train + counts.val;
    let ref_train = &indices[..counts.train];
    let ref_val = &indices[counts.train..val_end];
    let ref_test = &indices[val_end..];

    let plan = dataset::split_plan(&pf, &pf.images, 0.2, 0.2);
    assert_eq!(plan.train, ref_train, "train cambió sin haber grupos");
    assert_eq!(plan.val, ref_val, "val cambió sin haber grupos");
    assert_eq!(plan.test, ref_test, "test cambió sin haber grupos");
}

#[test]
fn split_agrupado_deja_val_no_vacio_aunque_un_grupo_se_coma_train() {
    // Un video de 20 fotogramas y una imagen suelta: el objetivo de train se
    // cubre con el primer grupo y aun así val tiene que quedar con algo, o el
    // entrenamiento arranca sin validación.
    let mut pf = make_project("p", "detection", default_classes());
    for i in 0..20 {
        pf.images.push(frame_entry("vidUnico", i));
    }
    pf.images.push(image_entry(
        "solo.png",
        "solo.png",
        200,
        100,
        vec![bbox_ann(0, 1.0, 1.0, 5.0, 5.0)],
    ));

    let plan = dataset::split_plan(&pf, &pf.images, 0.2, 0.0);
    assert!(!plan.train.is_empty(), "train vacío");
    assert!(!plan.val.is_empty(), "val vacío con dos grupos disponibles");
    assert_eq!(plan.groups.train + plan.groups.val + plan.groups.test, 2);
}

#[test]
fn split_agrupado_sin_test_no_inventa_particion_de_test() {
    // Un grupo que desborda su partición empuja el resto a la siguiente. Con
    // `test_split` en 0 ese empuje no puede terminar creando un conjunto de test
    // que nadie pidió: el dataset lo declararía y el script lo evaluaría.
    let mut pf = make_project("p", "detection", default_classes());
    for i in 0..15 {
        pf.images.push(frame_entry("vidGrande", i));
    }
    for vid in ["vidB", "vidC"] {
        for i in 0..3 {
            pf.images.push(frame_entry(vid, i));
        }
    }

    let plan = dataset::split_plan(&pf, &pf.images, 0.2, 0.0);
    assert!(plan.test.is_empty(), "apareció test con test_split = 0");
    assert!(!plan.has_test());
    assert!(!plan.train.is_empty());
    assert!(!plan.val.is_empty());
    assert_eq!(
        plan.train.len() + plan.val.len(),
        pf.images.len(),
        "se perdieron imágenes"
    );
}

#[test]
fn split_agrupado_es_reproducible() {
    let mut pf = make_project("p", "detection", default_classes());
    for vid in ["a", "b", "c", "d"] {
        for i in 0..4 {
            pf.images.push(frame_entry(vid, i));
        }
    }
    let p1 = dataset::split_plan(&pf, &pf.images, 0.25, 0.25);
    let p2 = dataset::split_plan(&pf, &pf.images, 0.25, 0.25);
    assert_eq!(p1.train, p2.train);
    assert_eq!(p1.val, p2.val);
    assert_eq!(p1.test, p2.test);
}

// ─── Tests: selección de imágenes entrenables ───────────────────────────────

#[test]
fn select_trainable_images_drops_unannotated() {
    let classes = default_classes();
    let images = vec![
        image_entry(
            "a.png",
            "a.png",
            100,
            100,
            vec![bbox_ann(0, 1.0, 1.0, 10.0, 10.0)],
        ),
        image_entry("sin_anotar.png", "sin_anotar.png", 100, 100, vec![]),
        image_entry(
            "b.png",
            "b.png",
            100,
            100,
            vec![bbox_ann(1, 2.0, 2.0, 10.0, 10.0)],
        ),
    ];

    let kept = dataset::select_trainable_images(images, &classes, false);

    assert_eq!(
        kept.len(),
        2,
        "la imagen sin anotaciones no debe entrar al dataset"
    );
    let names: Vec<_> = kept.iter().map(|i| i.name.as_str()).collect();
    assert!(!names.contains(&"sin_anotar.png"));
}

#[test]
fn select_trainable_images_drops_orphan_annotations_and_then_image() {
    let classes = default_classes(); // ids 0 y 1
    let images = vec![
        // Solo tiene una anotación de una clase borrada → queda vacía → se descarta
        image_entry(
            "huerfana.png",
            "huerfana.png",
            100,
            100,
            vec![bbox_ann(99, 1.0, 1.0, 5.0, 5.0)],
        ),
        // Mezcla: conserva la válida y sobrevive
        image_entry(
            "mixta.png",
            "mixta.png",
            100,
            100,
            vec![
                bbox_ann(99, 1.0, 1.0, 5.0, 5.0),
                bbox_ann(0, 2.0, 2.0, 5.0, 5.0),
            ],
        ),
    ];

    let kept = dataset::select_trainable_images(images, &classes, false);

    assert_eq!(kept.len(), 1);
    assert_eq!(kept[0].name, "mixta.png");
    assert_eq!(
        kept[0].annotations.len(),
        1,
        "la anotación huérfana debe quedar fuera"
    );
    assert_eq!(kept[0].annotations[0].class_id, 0);
}

#[test]
fn select_trainable_images_keeps_annotated_video_frames() {
    let classes = default_classes();
    let mut frame = image_entry(
        "f_000001.jpg",
        "f_000001.jpg",
        100,
        100,
        vec![bbox_ann(0, 1.0, 1.0, 10.0, 10.0)],
    );
    frame.video_id = Some("vid-1".into());
    frame.frame_index = Some(1);

    let mut frame_vacio = image_entry("f_000002.jpg", "f_000002.jpg", 100, 100, vec![]);
    frame_vacio.video_id = Some("vid-1".into());
    frame_vacio.frame_index = Some(2);

    let kept = dataset::select_trainable_images(vec![frame, frame_vacio], &classes, false);

    assert_eq!(kept.len(), 1, "un frame bakeado es una imagen anotada más");
    assert_eq!(kept[0].frame_index, Some(1));
}

#[test]
fn background_images_enter_the_dataset_as_negatives() {
    // Una imagen sin anotaciones se descarta porque no se distingue de una sin
    // anotar. La marca de fondo es esa distinción: la vuelve un negativo real.
    let classes = default_classes();
    let sin_anotar = image_entry("a.png", "a.png", 100, 100, vec![]);
    let mut fondo = image_entry("b.png", "b.png", 100, 100, vec![]);
    fondo.is_background = true;

    let kept = dataset::select_trainable_images(vec![sin_anotar, fondo], &classes, true);
    assert_eq!(kept.len(), 1);
    assert_eq!(kept[0].name, "b.png");
    assert!(kept[0].annotations.is_empty(), "el fondo va sin cajas");
}

#[test]
fn background_images_stay_out_of_classification() {
    // En clasificación no existe el negativo: una imagen sin clase acabaría en
    // una carpeta `unknown` que ImageFolder tomaría como una clase más.
    let classes = default_classes();
    let mut fondo = image_entry("b.png", "b.png", 100, 100, vec![]);
    fondo.is_background = true;
    assert!(dataset::select_trainable_images(vec![fondo], &classes, false).is_empty());
}

#[test]
fn background_flag_does_not_erase_annotations() {
    // Marcar fondo y luego anotar no debe perder las cajas: manda lo anotado.
    let classes = default_classes();
    let mut img = image_entry(
        "a.png",
        "a.png",
        100,
        100,
        vec![bbox_ann(0, 1.0, 1.0, 5.0, 5.0)],
    );
    img.is_background = true;

    let kept = dataset::select_trainable_images(vec![img], &classes, true);
    assert_eq!(kept.len(), 1);
    assert_eq!(kept[0].annotations.len(), 1);
}

#[test]
fn task_uses_background_only_outside_classification() {
    assert!(dataset::task_uses_background("detect"));
    assert!(dataset::task_uses_background("segment"));
    assert!(dataset::task_uses_background("pose"));
    assert!(!dataset::task_uses_background("classify"));
    assert!(!dataset::task_uses_background("multi_classify"));
}

#[test]
fn select_trainable_images_empty_when_nothing_annotated() {
    let classes = default_classes();
    let images = vec![
        image_entry("a.png", "a.png", 100, 100, vec![]),
        image_entry("b.png", "b.png", 100, 100, vec![]),
    ];
    assert!(dataset::select_trainable_images(images, &classes, false).is_empty());
}

#[test]
fn backend_uses_images_only_for_vision_backends() {
    use crate::training::TrainingBackend as B;
    for b in [
        B::Yolo,
        B::RtDetr,
        B::RfDetr,
        B::HfDetection,
        B::Smp,
        B::HfSegmentation,
        B::HfInstance,
        B::HfPose,
        B::Timm,
        B::HfClassification,
    ] {
        assert!(
            dataset::backend_uses_images(&b),
            "{:?} entrena sobre imágenes",
            b
        );
    }
    for b in [
        B::Tsai,
        B::PytorchForecasting,
        B::Pyod,
        B::Tslearn,
        B::Pypots,
        B::Stumpy,
        B::Sklearn,
    ] {
        assert!(
            !dataset::backend_uses_images(&b),
            "{:?} lee su propio CSV",
            b
        );
    }
}

// ════════════════════════════════════════════════════════════════════════════
// Utils/converters — funciones numéricas y de strings
// ════════════════════════════════════════════════════════════════════════════

use crate::utils::converters::{
    escape_xml, mime_type_from_ext, normalize_coordinates, obb_to_aabbox, polygon_area,
    sanitize_folder_name,
};

#[test]
fn normalize_coordinates_divides_by_image_size() {
    let (nx, ny, nw, nh) = normalize_coordinates(10.0, 20.0, 100.0, 50.0, 200.0, 100.0);
    assert!((nx - 0.05).abs() < 1e-9);
    assert!((ny - 0.20).abs() < 1e-9);
    assert!((nw - 0.50).abs() < 1e-9);
    assert!((nh - 0.50).abs() < 1e-9);
}

#[test]
fn obb_to_aabbox_zero_rotation_equals_bbox_corners() {
    // OBB (cx=50, cy=50, w=20, h=10, 0°) → xmin=40, ymin=45, xmax=60, ymax=55
    let (min_x, min_y, max_x, max_y) = obb_to_aabbox(50.0, 50.0, 20.0, 10.0, 0.0);
    assert!((min_x - 40.0).abs() < 1e-6);
    assert!((min_y - 45.0).abs() < 1e-6);
    assert!((max_x - 60.0).abs() < 1e-6);
    assert!((max_y - 55.0).abs() < 1e-6);
}

#[test]
fn obb_to_aabbox_45_degrees_expands_bbox() {
    // Cuadrado 10×10 rotado 45° → bbox circunscrito de lado ≈ 10·√2 ≈ 14.14
    let (min_x, _, max_x, _) = obb_to_aabbox(0.0, 0.0, 10.0, 10.0, 45.0);
    let side = max_x - min_x;
    assert!(
        (side - (10.0_f64 * 2.0_f64.sqrt())).abs() < 1e-6,
        "side = {}",
        side
    );
}

#[test]
fn escape_xml_replaces_all_specials() {
    let s = escape_xml("<tag attr=\"v\" val='x' a&b>");
    assert_eq!(
        s,
        "&lt;tag attr=&quot;v&quot; val=&apos;x&apos; a&amp;b&gt;"
    );
}

#[test]
fn sanitize_folder_name_replaces_invalid_and_lowercases() {
    assert_eq!(sanitize_folder_name("Foo/Bar Baz"), "foo_bar_baz");
    assert_eq!(sanitize_folder_name("a<b>c:d?e*f"), "a_b_c_d_e_f");
    assert_eq!(sanitize_folder_name("KEEP-ok_123"), "keep-ok_123");
}

#[test]
fn mime_type_from_ext_handles_known_and_unknown() {
    assert_eq!(mime_type_from_ext("foo.jpg"), "image/jpeg");
    assert_eq!(mime_type_from_ext("foo.JPEG"), "image/jpeg");
    assert_eq!(mime_type_from_ext("foo.png"), "image/png");
    assert_eq!(mime_type_from_ext("foo.webp"), "image/webp");
    assert_eq!(mime_type_from_ext("foo.gif"), "image/gif");
    // Fallback
    assert_eq!(mime_type_from_ext("foo.xyz"), "image/jpeg");
    assert_eq!(mime_type_from_ext("noext"), "image/jpeg");
}

#[test]
fn polygon_area_shoelace_unit_square() {
    let pts = vec![(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)];
    assert!((polygon_area(&pts) - 1.0).abs() < 1e-9);
}

#[test]
fn polygon_area_triangle() {
    let pts = vec![(0.0, 0.0), (4.0, 0.0), (0.0, 3.0)];
    assert!((polygon_area(&pts) - 6.0).abs() < 1e-9);
}

#[test]
fn polygon_area_degenerate_returns_zero() {
    assert_eq!(polygon_area(&[]), 0.0);
    assert_eq!(polygon_area(&[(0.0, 0.0), (1.0, 1.0)]), 0.0);
}

#[test]
fn polygon_area_is_orientation_independent() {
    // Horario vs antihorario → mismo valor absoluto
    let cw = vec![(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0)];
    let ccw = vec![(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)];
    assert!((polygon_area(&cw) - polygon_area(&ccw)).abs() < 1e-9);
}

// ─── Tests: interpolación de tracks de video ────────────────────────────────

use crate::store::project_file::{
    KeyframeEntry, TimeSeriesEntry, TrackEntry, TsAnnotationEntry, VideoEntry,
};
use crate::store::videos::{interpolate_bbox, pct_bbox_to_px, Extend, InterpMode, TrackInterp};

fn kf(frame_index: i64, x: f64, y: f64, w: f64, h: f64) -> KeyframeEntry {
    KeyframeEntry {
        frame_index,
        bbox_x: x,
        bbox_y: y,
        bbox_width: w,
        bbox_height: h,
        is_keyframe: true,
        enabled: true,
    }
}

fn video_with_track(video_id: &str, class_id: i64, keyframes: Vec<KeyframeEntry>) -> VideoEntry {
    VideoEntry {
        id: video_id.into(),
        name: "v.mp4".into(),
        file: "v.mp4".into(),
        fps_extraction: 5.0,
        fps_original: Some(30.0),
        total_frames: 100,
        duration_ms: 20_000,
        width: 1920,
        height: 1080,
        uploaded: 0.0,
        status: "ready".into(),
        tracks: vec![TrackEntry {
            id: format!("track-{}", video_id),
            class_id,
            label: None,
            enabled: true,
            interpolation: "linear".into(),
            extend: "none".into(),
            keyframes,
        }],
    }
}

fn video_frame(
    video_id: &str,
    frame_index: i64,
    w: u32,
    h: u32,
    anns: Vec<AnnotationEntry>,
) -> ImageEntry {
    let mut e = image_entry(
        &format!("frame_{:06}.jpg", frame_index),
        &format!("frame_{:06}.jpg", frame_index),
        w,
        h,
        anns,
    );
    e.video_id = Some(video_id.into());
    e.frame_index = Some(frame_index);
    e
}

#[test]
fn interpolate_bbox_returns_exact_keyframe() {
    let kfs = vec![
        kf(0, 10.0, 20.0, 30.0, 40.0),
        kf(10, 50.0, 60.0, 30.0, 40.0),
    ];
    let (x, y, w, h, enabled) =
        interpolate_bbox(&kfs, 0, TrackInterp::default()).expect("keyframe exacto");
    assert_eq!((x, y, w, h), (10.0, 20.0, 30.0, 40.0));
    assert!(enabled);
}

#[test]
fn interpolate_bbox_is_linear_between_keyframes() {
    let kfs = vec![kf(0, 0.0, 0.0, 10.0, 10.0), kf(10, 100.0, 50.0, 20.0, 30.0)];
    let (x, y, w, h, _) = interpolate_bbox(&kfs, 5, TrackInterp::default()).expect("punto medio");
    assert!((x - 50.0).abs() < 1e-9);
    assert!((y - 25.0).abs() < 1e-9);
    assert!((w - 15.0).abs() < 1e-9);
    assert!((h - 20.0).abs() < 1e-9);
}

#[test]
fn interpolate_bbox_does_not_extrapolate() {
    let kfs = vec![kf(10, 0.0, 0.0, 10.0, 10.0), kf(20, 10.0, 10.0, 10.0, 10.0)];
    assert!(
        interpolate_bbox(&kfs, 5, TrackInterp::default()).is_none(),
        "antes del primer keyframe no hay caja"
    );
    assert!(
        interpolate_bbox(&kfs, 25, TrackInterp::default()).is_none(),
        "después del último keyframe no hay caja"
    );
}

#[test]
fn disabled_keyframe_only_hides_forward() {
    // El keyframe deshabilitado marca la salida de escena: apaga de ese
    // fotograma en adelante, no el tramo que viene antes. Antes lo apagaba en
    // ambos sentidos y borrar la caja de un fotograma interpolado hacía
    // desaparecer el track entre sus dos keyframes vecinos.
    let mut kfs = vec![
        kf(0, 0.0, 0.0, 10.0, 10.0),
        kf(10, 10.0, 10.0, 10.0, 10.0),
        kf(20, 20.0, 20.0, 10.0, 10.0),
    ];
    kfs[1].enabled = false;

    let (x, _, _, _, enabled) =
        interpolate_bbox(&kfs, 5, TrackInterp::default()).expect("tramo previo intacto");
    assert!(enabled, "el tramo anterior a la salida sigue vivo");
    assert!((x - 5.0).abs() < 1e-9, "e interpola hacia el keyframe");

    let (_, _, _, _, enabled) =
        interpolate_bbox(&kfs, 15, TrackInterp::default()).expect("caja fantasma");
    assert!(!enabled, "tras la salida no hay caja hasta el siguiente kf");

    let (_, _, _, _, enabled) =
        interpolate_bbox(&kfs, 20, TrackInterp::default()).expect("reentrada");
    assert!(enabled, "el siguiente keyframe habilitado reabre el track");
}

#[test]
fn ghost_box_after_exit_keeps_last_geometry() {
    // La caja del tramo apagado se dibuja en gris y debe poder reactivarse:
    // conserva la geometría del keyframe de salida en vez de colapsar a cero.
    let mut kfs = vec![
        kf(0, 0.0, 0.0, 10.0, 10.0),
        kf(10, 40.0, 30.0, 12.0, 14.0),
        kf(20, 90.0, 80.0, 10.0, 10.0),
    ];
    kfs[1].enabled = false;
    let (x, y, w, h, enabled) =
        interpolate_bbox(&kfs, 15, TrackInterp::default()).expect("caja fantasma");
    assert!(!enabled);
    assert_eq!((x, y, w, h), (40.0, 30.0, 12.0, 14.0));
}

#[test]
fn extend_after_holds_last_keyframe() {
    let kfs = vec![kf(10, 1.0, 2.0, 3.0, 4.0), kf(20, 5.0, 6.0, 7.0, 8.0)];
    let interp = TrackInterp {
        mode: InterpMode::Linear,
        extend: Extend::After,
    };
    let (x, y, w, h, enabled) = interpolate_bbox(&kfs, 999, interp).expect("caja prolongada");
    assert_eq!((x, y, w, h), (5.0, 6.0, 7.0, 8.0));
    assert!(enabled);
    assert!(
        interpolate_bbox(&kfs, 5, interp).is_none(),
        "`after` no prolonga hacia atrás"
    );
}

#[test]
fn extend_both_holds_first_keyframe_backwards() {
    let kfs = vec![kf(10, 1.0, 2.0, 3.0, 4.0), kf(20, 5.0, 6.0, 7.0, 8.0)];
    let interp = TrackInterp {
        mode: InterpMode::Linear,
        extend: Extend::Both,
    };
    let (x, y, w, h, enabled) = interpolate_bbox(&kfs, 0, interp).expect("caja prolongada");
    assert_eq!((x, y, w, h), (1.0, 2.0, 3.0, 4.0));
    assert!(enabled);
}

#[test]
fn extend_after_stops_at_an_exit_keyframe() {
    // Prolongar no significa "para siempre": marcar la salida cierra el track.
    let mut kfs = vec![kf(0, 0.0, 0.0, 10.0, 10.0), kf(10, 10.0, 10.0, 10.0, 10.0)];
    kfs[1].enabled = false;
    let interp = TrackInterp {
        mode: InterpMode::Linear,
        extend: Extend::After,
    };
    let (_, _, _, _, enabled) = interpolate_bbox(&kfs, 500, interp).expect("caja fantasma");
    assert!(!enabled);
}

#[test]
fn ease_matches_linear_at_the_ends_and_lags_at_the_start() {
    let kfs = vec![kf(0, 0.0, 0.0, 10.0, 10.0), kf(10, 100.0, 0.0, 10.0, 10.0)];
    let interp = TrackInterp {
        mode: InterpMode::Ease,
        extend: Extend::None,
    };
    let (mid, _, _, _, _) = interpolate_bbox(&kfs, 5, interp).expect("punto medio");
    assert!((mid - 50.0).abs() < 1e-9, "el centro coincide con la recta");

    let (early, _, _, _, _) = interpolate_bbox(&kfs, 1, interp).expect("arranque");
    assert!(early < 10.0, "el arranque es más lento que la recta");

    let (late, _, _, _, _) = interpolate_bbox(&kfs, 9, interp).expect("frenada");
    assert!(late > 90.0, "y la frenada, simétrica");
}

#[test]
fn smooth_follows_the_curve_instead_of_the_chord() {
    // Tres keyframes en curva: en el tramo central el spline se separa de la
    // recta que une sus extremos, que es justo lo que la interpolación lineal
    // no puede hacer.
    let kfs = vec![
        kf(0, 0.0, 0.0, 10.0, 10.0),
        kf(10, 10.0, 40.0, 10.0, 10.0),
        kf(20, 40.0, 50.0, 10.0, 10.0),
    ];
    let smooth = TrackInterp {
        mode: InterpMode::Smooth,
        extend: Extend::None,
    };
    let (sx, _, _, _, _) = interpolate_bbox(&kfs, 15, smooth).expect("spline");
    let (lx, _, _, _, _) = interpolate_bbox(&kfs, 15, TrackInterp::default()).expect("recta");
    assert!(
        (sx - lx).abs() > 1e-6,
        "smooth debe diferir de linear en un movimiento curvo"
    );
}

#[test]
fn smooth_reduces_to_linear_with_only_two_keyframes() {
    // Sin vecinos que den curvatura, el spline no puede inventarse una: debe
    // caer exactamente en la recta.
    let kfs = vec![kf(0, 0.0, 0.0, 10.0, 20.0), kf(10, 100.0, 50.0, 30.0, 40.0)];
    let smooth = TrackInterp {
        mode: InterpMode::Smooth,
        extend: Extend::None,
    };
    let (x, y, w, h, _) = interpolate_bbox(&kfs, 3, smooth).expect("spline");
    let (lx, ly, lw, lh, _) = interpolate_bbox(&kfs, 3, TrackInterp::default()).expect("recta");
    assert!((x - lx).abs() < 1e-9);
    assert!((y - ly).abs() < 1e-9);
    assert!((w - lw).abs() < 1e-9);
    assert!((h - lh).abs() < 1e-9);
}

#[test]
fn smooth_never_produces_a_negative_size() {
    // Un spline sobrepasa los extremos. Con un tamaño que cae en picado el
    // rebote podría cruzar el cero y escribir un ancho negativo en el dataset.
    let kfs = vec![
        kf(0, 0.0, 0.0, 80.0, 80.0),
        kf(10, 0.0, 0.0, 2.0, 2.0),
        kf(20, 0.0, 0.0, 1.0, 1.0),
        kf(30, 0.0, 0.0, 1.0, 1.0),
    ];
    let smooth = TrackInterp {
        mode: InterpMode::Smooth,
        extend: Extend::None,
    };
    for frame in 1..30 {
        let (_, _, w, h, _) = interpolate_bbox(&kfs, frame, smooth).expect("spline");
        assert!(
            w >= 0.0 && h >= 0.0,
            "tamaño negativo en el fotograma {frame}"
        );
    }
}

#[test]
fn pct_bbox_to_px_scales_by_frame_size() {
    // Una caja que cubre la mitad del fotograma en un 1920x1080
    let (x, y, w, h) = pct_bbox_to_px(25.0, 25.0, 50.0, 50.0, 1920.0, 1080.0);
    assert!((x - 480.0).abs() < 1e-9);
    assert!((y - 270.0).abs() < 1e-9);
    assert!((w - 960.0).abs() < 1e-9);
    assert!((h - 540.0).abs() < 1e-9);
}

// ─── Tests: migración v1 → v2 (cajas consolidadas en porcentaje) ────────────

#[test]
fn migration_v1_rescales_baked_bboxes_to_pixels() {
    let tmp = tempfile::tempdir().unwrap();
    let mut project = make_project("video", "bbox", default_classes());
    project.version = 1;
    project.videos = vec![video_with_track(
        "vid-1",
        0,
        vec![
            kf(0, 10.0, 20.0, 30.0, 40.0),
            kf(10, 10.0, 20.0, 30.0, 40.0),
        ],
    )];

    // Fotograma con la caja tal como la escribía el bake antiguo: en porcentaje.
    let baked = bbox_ann(0, 10.0, 20.0, 30.0, 40.0);
    // Y una anotación hecha a mano, en píxeles, que no debe tocarse.
    let manual = bbox_ann(1, 500.0, 400.0, 100.0, 80.0);
    project.images = vec![video_frame("vid-1", 5, 1000, 500, vec![baked, manual])];

    store_io::write_project(tmp.path(), &project).unwrap();
    let migrated = store_io::read_project(tmp.path()).unwrap();

    assert_eq!(
        migrated.version,
        crate::store::project_file::CURRENT_VERSION
    );

    let anns = &migrated.images[0].annotations;
    let track_ann = anns
        .iter()
        .find(|a| a.track_id.is_some())
        .expect("la caja del track");
    assert_eq!(track_ann.source, "track");
    assert_eq!(track_ann.data["x"].as_f64().unwrap(), 100.0); // 10% de 1000
    assert_eq!(track_ann.data["y"].as_f64().unwrap(), 100.0); // 20% de 500
    assert_eq!(track_ann.data["width"].as_f64().unwrap(), 300.0);
    assert_eq!(track_ann.data["height"].as_f64().unwrap(), 200.0);

    let untouched = anns
        .iter()
        .find(|a| a.class_id == 1)
        .expect("la anotación manual");
    assert!(
        untouched.track_id.is_none(),
        "lo anotado a mano no se marca como track"
    );
    assert_eq!(untouched.data["x"].as_f64().unwrap(), 500.0);
}

#[test]
fn migration_v1_leaves_projects_without_videos_alone() {
    let tmp = tempfile::tempdir().unwrap();
    let mut project = make_project("imagenes", "bbox", default_classes());
    project.version = 1;
    project.images = vec![image_entry(
        "a.png",
        "a.png",
        100,
        100,
        vec![bbox_ann(0, 1.0, 2.0, 3.0, 4.0)],
    )];

    store_io::write_project(tmp.path(), &project).unwrap();
    let migrated = store_io::read_project(tmp.path()).unwrap();

    let ann = &migrated.images[0].annotations[0];
    assert_eq!(ann.data["x"].as_f64().unwrap(), 1.0);
    assert!(ann.track_id.is_none());
}

// ─── Tests: migración v2 → v3 (datos de series a archivos) ──────────────────

fn ts_entry_with_inline_data(id: &str, points: usize) -> TimeSeriesEntry {
    let timestamps: Vec<f64> = (0..points).map(|i| i as f64).collect();
    let values: Vec<f64> = (0..points).map(|i| (i * 2) as f64).collect();
    TimeSeriesEntry {
        id: id.into(),
        name: format!("serie-{}", id),
        data: Some(json!({ "timestamps": timestamps, "values": values })),
        point_count: 0,
        series_count: 1,
        columns: None,
        annotations: vec![],
        uploaded: 0.0,
        annotated: None,
        status: "pending".into(),
    }
}

#[test]
fn migration_v2_moves_timeseries_data_to_files() {
    let tmp = tempfile::tempdir().unwrap();
    let mut project = make_project("series", "timeseries-classification", default_classes());
    project.version = 2;
    project.timeseries = vec![ts_entry_with_inline_data("ts-1", 4)];

    store_io::write_project(tmp.path(), &project).unwrap();
    let migrated = store_io::read_project(tmp.path()).unwrap();

    assert_eq!(
        migrated.version,
        crate::store::project_file::CURRENT_VERSION
    );
    let ts = &migrated.timeseries[0];
    assert!(ts.data.is_none(), "los datos salen de project.json");
    assert_eq!(ts.point_count, 4);
    assert_eq!(ts.series_count, 1);

    let data_path = tmp.path().join("timeseries").join("ts-1.json");
    assert!(data_path.exists(), "los datos quedan en su propio archivo");
    let on_disk: serde_json::Value =
        serde_json::from_slice(&fs::read(&data_path).unwrap()).unwrap();
    assert_eq!(on_disk["timestamps"].as_array().unwrap().len(), 4);

    // project.json ya no contiene los puntos
    let raw = fs::read_to_string(tmp.path().join("project.json")).unwrap();
    assert!(!raw.contains("\"timestamps\""));
}

#[test]
fn describe_data_counts_points_and_series() {
    let univariate = json!({ "timestamps": [1, 2, 3], "values": [10, 20, 30] });
    let (points, series, columns) = crate::store::timeseries::describe_data(&univariate);
    assert_eq!((points, series), (3, 1));
    assert!(columns.is_none());

    let multivariate = json!({
        "timestamps": [1, 2],
        "values": [[1, 2], [3, 4], [5, 6]],
        "columns": ["a", "b", "c"],
    });
    let (points, series, columns) = crate::store::timeseries::describe_data(&multivariate);
    assert_eq!((points, series), (2, 3));
    assert_eq!(columns.unwrap(), vec!["a", "b", "c"]);
}

// ─── Tests: parseo de CSV de series temporales ──────────────────────────────

fn parse_csv_text(text: &str, has_header: bool) -> crate::commands::csv_commands::CSVParseResult {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("data.csv");
    fs::write(&path, text).unwrap();
    crate::commands::csv_commands::parse_csv(
        path.to_string_lossy().to_string(),
        crate::commands::csv_commands::CSVParseOptions {
            has_header: Some(has_header),
            timestamp_column: Some(0),
            value_columns: None,
            delimiter: None,
        },
    )
    .expect("parse_csv")
}

#[test]
fn parse_csv_accepts_iso_dates() {
    let result = parse_csv_text("fecha,valor\n2026-01-15,1.5\n2026-01-16,2.5\n", true);
    assert_eq!(
        result.row_count, 2,
        "un CSV con fechas no debe quedarse vacío"
    );
    assert_eq!(result.report.timestamp_format, "datetime");
    // 2026-01-15T00:00:00Z en milisegundos
    assert_eq!(result.timestamps[0], 1_768_435_200_000.0);
    assert_eq!(result.report.skipped_bad_timestamp, 0);
}

#[test]
fn parse_csv_accepts_datetime_with_time() {
    let result = parse_csv_text("t,v\n2026-01-15 10:30:00,1\n2026-01-15T11:30:00,2\n", true);
    assert_eq!(result.row_count, 2);
    assert_eq!(result.timestamps[1] - result.timestamps[0], 3_600_000.0);
}

#[test]
fn parse_csv_keeps_numeric_timestamps() {
    let result = parse_csv_text("t,v\n0,1\n1,2\n2,3\n", true);
    assert_eq!(result.report.timestamp_format, "numeric");
    assert_eq!(result.timestamps, vec![0.0, 1.0, 2.0]);
}

#[test]
fn parse_csv_respects_quoted_fields() {
    // Una coma dentro de un campo entre comillas no añade una columna
    let result = parse_csv_text("t,ciudad,v\n0,\"Madrid, ES\",1\n1,\"Lima, PE\",2\n", true);
    assert_eq!(
        result.row_count, 2,
        "las filas con comillas no se descartan"
    );
    assert_eq!(result.column_count, 3);
    assert_eq!(result.report.skipped_malformed, 0);
}

#[test]
fn parse_csv_reports_missing_values_as_gaps() {
    let result = parse_csv_text("t,v\n0,1\n1,\n2,NA\n3,4\n", true);
    assert_eq!(result.row_count, 4);
    assert_eq!(result.report.missing_values, 2);
    let values = result.values.as_array().expect("array de valores");
    assert!(
        values[1].is_null(),
        "una celda vacía es un hueco, no un cero"
    );
    assert!(values[2].is_null());
    assert_eq!(values[3].as_f64().unwrap(), 4.0);
}

#[test]
fn parse_csv_reports_dropped_rows() {
    let result = parse_csv_text("t,v\n0,1\n no_es_fecha,2\n2,3\n", true);
    assert_eq!(result.row_count, 2);
    assert_eq!(result.report.skipped_bad_timestamp, 1);
}

#[test]
fn parse_csv_falls_back_to_row_index_without_time_column() {
    let result = parse_csv_text("etiqueta,v\nfoo,1\nbar,2\n", true);
    assert_eq!(result.report.timestamp_format, "rowIndex");
    assert_eq!(result.timestamps, vec![0.0, 1.0]);
}

#[test]
fn validate_csv_accepts_quoted_commas() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("q.csv");
    fs::write(&path, "t,ciudad,v\n0,\"Madrid, ES\",1\n").unwrap();
    let validation =
        crate::commands::csv_commands::validate_csv(path.to_string_lossy().to_string(), None)
            .unwrap();
    assert!(validation.valid, "{:?}", validation.error);
    assert_eq!(validation.column_count, 3);
}

// ─── Tests: exportación de series temporales ────────────────────────────────

fn ts_annotation(kind: &str, class_id: Option<i64>, data: serde_json::Value) -> TsAnnotationEntry {
    TsAnnotationEntry {
        id: uuid::Uuid::new_v4().to_string(),
        annotation_type: kind.into(),
        class_id,
        data,
    }
}

#[test]
fn timeseries_csv_export_labels_points_and_keeps_gaps() {
    let tmp = tempfile::tempdir().unwrap();
    let mut project = make_project("series", "timeseries-segmentation", default_classes());
    project.version = crate::store::project_file::CURRENT_VERSION;

    let mut ts = ts_entry_with_inline_data("ts-1", 0);
    ts.data = None;
    ts.point_count = 4;
    ts.annotations = vec![ts_annotation(
        "range",
        Some(0),
        json!({ "startTimestamp": 1.0, "endTimestamp": 2.0 }),
    )];
    project.timeseries = vec![ts];

    // Datos en su archivo, con un hueco
    let ts_dir = tmp.path().join("timeseries");
    fs::create_dir_all(&ts_dir).unwrap();
    fs::write(
        ts_dir.join("ts-1.json"),
        serde_json::to_vec(&json!({
            "timestamps": [0.0, 1.0, 2.0, 3.0],
            "values": [10.0, null, 30.0, 40.0],
        }))
        .unwrap(),
    )
    .unwrap();

    let out = tmp.path().join("export.zip");
    let file = fs::File::create(&out).unwrap();
    export::timeseries_export::export(&project, tmp.path(), file, "timeseries-csv", |_| {})
        .unwrap();

    let mut zip = ZipArchive::new(fs::File::open(&out).unwrap()).unwrap();
    let names: Vec<String> = zip.file_names().map(|s| s.to_string()).collect();
    assert!(names
        .iter()
        .any(|n| n.ends_with(".csv") && n.starts_with("series/")));
    assert!(names.contains(&"annotations.csv".to_string()));
    assert!(names.contains(&"classes.csv".to_string()));

    let series_name = names
        .iter()
        .find(|n| n.starts_with("series/"))
        .unwrap()
        .clone();
    let mut csv = String::new();
    {
        use std::io::Read;
        zip.by_name(&series_name)
            .unwrap()
            .read_to_string(&mut csv)
            .unwrap();
    }

    let lines: Vec<&str> = csv.lines().collect();
    assert_eq!(lines[0], "timestamp,value,label");
    assert_eq!(lines[1], "0,10,");
    assert_eq!(
        lines[2], "1,,cat",
        "el hueco queda vacío y el punto va etiquetado"
    );
    assert_eq!(lines[3], "2,30,cat");
    assert_eq!(lines[4], "3,40,");
}

#[test]
fn timeseries_export_rejects_project_without_series() {
    let tmp = tempfile::tempdir().unwrap();
    let project = make_project("vacio", "timeseries-classification", default_classes());
    let out = tmp.path().join("export.zip");
    let file = fs::File::create(&out).unwrap();
    let err =
        export::timeseries_export::export(&project, tmp.path(), file, "timeseries-csv", |_| {})
            .unwrap_err();
    assert!(err.contains("No hay series temporales"));
}

// ─── Tests: consolidación (bake) de tracks de video ─────────────────────────

use crate::store::videos::{bake_annotations_for_frame, BakeTrack};

fn bake_track(track_id: &str, keyframes: Vec<KeyframeEntry>) -> BakeTrack {
    BakeTrack {
        track_id: track_id.to_string(),
        class_id: 0,
        keyframes,
        interp: TrackInterp::default(),
    }
}

fn track_kfs_fixture() -> Vec<BakeTrack> {
    vec![bake_track(
        "track-1",
        vec![kf(0, 0.0, 0.0, 50.0, 50.0), kf(10, 50.0, 50.0, 50.0, 50.0)],
    )]
}

#[test]
fn bake_converts_keyframe_percent_to_frame_pixels() {
    // Keyframe en el 0% que ocupa la mitad del fotograma, sobre 1920x1080
    let anns = bake_annotations_for_frame(&track_kfs_fixture(), 0, 1920, 1080);
    assert_eq!(anns.len(), 1);
    let data = &anns[0].data;
    assert_eq!(data["x"].as_f64().unwrap(), 0.0);
    assert_eq!(data["width"].as_f64().unwrap(), 960.0);
    assert_eq!(data["height"].as_f64().unwrap(), 540.0);
}

#[test]
fn bake_marks_annotations_as_track_source() {
    let anns = bake_annotations_for_frame(&track_kfs_fixture(), 5, 1000, 1000);
    assert_eq!(
        anns[0].source, "track",
        "lo interpolado no es una etiqueta humana"
    );
    assert_eq!(anns[0].track_id.as_deref(), Some("track-1"));
    assert_eq!(anns[0].annotation_type, "bbox");
}

#[test]
fn bake_interpolates_midpoint_in_pixels() {
    // Punto medio entre 0% y 50% → 25% de 1000 px = 250 px
    let anns = bake_annotations_for_frame(&track_kfs_fixture(), 5, 1000, 1000);
    assert_eq!(anns[0].data["x"].as_f64().unwrap(), 250.0);
    assert_eq!(anns[0].data["y"].as_f64().unwrap(), 250.0);
}

#[test]
fn bake_produces_nothing_outside_track_span() {
    let kfs = vec![bake_track(
        "t",
        vec![kf(10, 0.0, 0.0, 10.0, 10.0), kf(20, 0.0, 0.0, 10.0, 10.0)],
    )];
    assert!(bake_annotations_for_frame(&kfs, 5, 100, 100).is_empty());
    assert!(bake_annotations_for_frame(&kfs, 25, 100, 100).is_empty());
    assert_eq!(bake_annotations_for_frame(&kfs, 15, 100, 100).len(), 1);
}

#[test]
fn bake_skips_frames_after_an_exit_keyframe() {
    let mut kfs = track_kfs_fixture();
    kfs[0].keyframes[1].enabled = false;
    assert_eq!(
        bake_annotations_for_frame(&kfs, 5, 100, 100).len(),
        1,
        "el tramo previo a la salida sí se consolida"
    );
    assert!(
        bake_annotations_for_frame(&kfs, 10, 100, 100).is_empty(),
        "desde la salida no hay anotación"
    );
}

#[test]
fn bake_extends_the_last_keyframe_when_the_track_says_so() {
    let mut kfs = track_kfs_fixture();
    kfs[0].interp.extend = Extend::After;
    let anns = bake_annotations_for_frame(&kfs, 500, 100, 100);
    assert_eq!(
        anns.len(),
        1,
        "la última caja sigue hasta el final del video"
    );
    assert_eq!(anns[0].data["x"].as_f64().unwrap(), 50.0);
}

#[test]
fn baked_bbox_normalizes_to_the_same_fraction_as_the_keyframe() {
    // La caja consolidada, al normalizarse para YOLO, debe recuperar la misma
    // fracción del fotograma que declaraba el keyframe. Este es el invariante
    // que rompía escribir porcentajes en un campo leído como píxeles.
    let width = 1920u32;
    let height = 1080u32;
    let anns = bake_annotations_for_frame(&track_kfs_fixture(), 0, width, height);
    let bbox = export::parse_bbox(&anns[0].data).expect("bbox");
    let (nx, ny, nw, nh) = crate::utils::converters::normalize_coordinates(
        bbox.x,
        bbox.y,
        bbox.width,
        bbox.height,
        width as f64,
        height as f64,
    );
    assert!((nx - 0.0).abs() < 1e-9);
    assert!((ny - 0.0).abs() < 1e-9);
    assert!(
        (nw - 0.5).abs() < 1e-9,
        "50% del ancho → 0.5 normalizado, no 0.026"
    );
    assert!((nh - 0.5).abs() < 1e-9);
}

// ─── Payloads IPC: structs `request` de los comandos ────────────────────────
//
// Los comandos que agrupan sus parámetros en un struct reciben el objeto bajo
// la clave `request` y lo deserializan con `rename_all = "camelCase"`. Un
// campo renombrado en `tauriDb.ts` / `inferenceService.ts` y no aquí (o al
// revés) falla en runtime, no al compilar: estos tests fijan el contrato con
// el JSON exacto que manda el frontend.

#[test]
fn ipc_upload_audio_request_matches_frontend_payload() {
    let payload = json!({
        "projectId": "p1",
        "filePath": "/tmp/a.wav",
        "durationMs": 1200,
        "sampleRate": 44100,
        "language": "es",
    });
    let req: crate::store::audio::UploadAudioRequest =
        serde_json::from_value(payload).expect("deserializa");
    assert_eq!(req.project_id, "p1");
    assert_eq!(req.file_path, "/tmp/a.wav");
    assert_eq!(req.duration_ms, 1200);
    assert_eq!(req.sample_rate, 44100);
    assert_eq!(req.language.as_deref(), Some("es"));
}

#[test]
fn ipc_save_transcription_request_matches_frontend_payload() {
    // `speakerId` y `language` viajan como undefined cuando el anotador no los
    // llena: tauri los envía como null.
    let payload = json!({
        "projectId": "p1",
        "audioId": "a1",
        "transcription": "hola",
        "speakerId": null,
        "language": null,
    });
    let req: crate::store::audio::SaveTranscriptionRequest =
        serde_json::from_value(payload).expect("deserializa");
    assert_eq!(req.audio_id, "a1");
    assert_eq!(req.transcription, "hola");
    assert!(req.speaker_id.is_none());
    assert!(req.language.is_none());
}

#[test]
fn ipc_save_tts_recording_request_matches_frontend_payload() {
    let payload = json!({
        "projectId": "p1",
        "sentenceId": "s1",
        "audioBase64": "AAAA",
        "fileExt": "webm",
        "durationMs": 900,
        "sampleRate": 48000,
    });
    let req: crate::store::audio::SaveTtsRecordingRequest =
        serde_json::from_value(payload).expect("deserializa");
    assert_eq!(req.sentence_id, "s1");
    assert_eq!(req.file_ext, "webm");
    assert_eq!(req.duration_ms, 900);
    assert_eq!(req.sample_rate, 48000);
}

#[test]
fn ipc_save_audio_annotation_request_accepts_partial_payload() {
    // `saveAudioAnnotation` manda siempre las seis claves, con null en las que
    // no aplican al tipo de proyecto.
    let payload = json!({
        "projectId": "p1",
        "audioId": "a1",
        "transcription": null,
        "speakerId": null,
        "language": null,
        "segments": null,
        "classId": 3,
        "events": null,
    });
    let req: crate::store::audio::SaveAudioAnnotationRequest =
        serde_json::from_value(payload).expect("deserializa");
    assert_eq!(req.class_id, Some(3));
    assert!(req.segments.is_none());
    assert!(req.events.is_none());
}

#[test]
fn ipc_update_track_request_matches_frontend_payload() {
    // `updateTrack` esparce `updates`: las claves ausentes no llegan.
    let payload = json!({
        "projectId": "p1",
        "trackId": "t1",
        "videoId": "v1",
        "enabled": false,
    });
    let req: crate::store::videos::UpdateTrackRequest =
        serde_json::from_value(payload).expect("deserializa");
    assert_eq!(req.track_id, "t1");
    assert_eq!(req.video_id, "v1");
    assert_eq!(req.enabled, Some(false));
    assert!(req.class_id.is_none());
    assert!(req.label.is_none());
}

#[test]
fn ipc_toggle_keyframe_request_matches_frontend_payload() {
    let payload = json!({
        "projectId": "p1",
        "trackId": "t1",
        "videoId": "v1",
        "frameIndex": 12,
        "enabled": true,
    });
    let req: crate::store::videos::ToggleKeyframeRequest =
        serde_json::from_value(payload).expect("deserializa");
    assert_eq!(req.frame_index, 12);
    assert!(req.enabled);
}

#[test]
fn ipc_set_keyframe_request_matches_frontend_payload() {
    let payload = json!({
        "projectId": "p1",
        "trackId": "t1",
        "videoId": "v1",
        "frameIndex": 4,
        "bboxX": 10.0,
        "bboxY": 20.0,
        "bboxWidth": 30.0,
        "bboxHeight": 40.0,
    });
    let req: crate::store::videos::SetKeyframeRequest =
        serde_json::from_value(payload).expect("deserializa");
    assert_eq!(req.frame_index, 4);
    assert_eq!(req.bbox_x, 10.0);
    assert_eq!(req.bbox_height, 40.0);
}

#[test]
fn ipc_upload_model_request_matches_frontend_payload() {
    let payload = json!({
        "projectId": "p1",
        "sourcePath": "/tmp/m.onnx",
        "name": "m",
        "format": "onnx",
        "task": "detect",
        "classNames": ["a", "b"],
        "inputSize": 640,
        "outputFormat": null,
        "metadata": null,
    });
    let req: crate::store::inference::UploadModelRequest =
        serde_json::from_value(payload).expect("deserializa");
    assert_eq!(req.source_path, "/tmp/m.onnx");
    assert_eq!(req.class_names.len(), 2);
    assert_eq!(req.input_size, Some(640));
    assert!(req.output_format.is_none());
}

#[test]
fn ipc_update_model_config_request_matches_frontend_payload() {
    let payload = json!({
        "projectId": "p1",
        "modelId": "m1",
        "classMapping": [
            { "modelClassId": 0, "modelClassName": "a", "projectClassId": "0" }
        ],
        "inputSize": null,
        "task": null,
        "outputFormat": null,
        "classNames": null,
        "metadataPatch": null,
    });
    let req: crate::store::inference::UpdateModelConfigRequest =
        serde_json::from_value(payload).expect("deserializa");
    assert_eq!(req.model_id, "m1");
    assert_eq!(req.class_mapping.len(), 1);
    assert!(req.input_size.is_none());
}

// ─── Runner: eventos de entrenamiento ───────────────────────────────────────

#[test]
fn eventos_con_infinity_o_nan_siguen_llegando() {
    // Python escribe `Infinity`/`NaN` para métricas no finitas y eso no es JSON
    // válido: antes se perdía el evento entero, con las métricas buenas incluidas.
    let linea = r#"{"type": "epoch", "epoch": 1, "metrics": {"a": Infinity, "b": NaN, "c": 1.5}}"#;
    let saneado = crate::training::runner::sanear_no_finitos(linea);
    let valor: serde_json::Value = serde_json::from_str(&saneado).expect("parsea tras sanear");
    assert!(valor["metrics"]["a"].is_null());
    assert!(valor["metrics"]["b"].is_null());
    assert_eq!(valor["metrics"]["c"].as_f64(), Some(1.5));
}

#[test]
fn infinity_negativo_tambien_se_sanea() {
    let saneado = crate::training::runner::sanear_no_finitos(r#"{"v": -Infinity}"#);
    let valor: serde_json::Value = serde_json::from_str(&saneado).unwrap();
    assert!(valor["v"].is_null());
}

// ─── Localización de artefactos de entrenamiento ────────────────────────────

fn job_con_result_dir(dir: &Path) -> crate::store::project_file::TrainingJobEntry {
    crate::store::project_file::TrainingJobEntry {
        id: "job-1".into(),
        status: "completed".into(),
        config: json!({}),
        progress: 100.0,
        logs: vec![],
        metrics: None,
        test_metrics: None,
        metrics_history: vec![],
        created_at: 0.0,
        updated_at: 0.0,
        result_dir: Some(dir.to_string_lossy().to_string()),
        best_model_path: None,
        dataset_dir: None,
        cloud_provider: None,
        cloud_job_id: None,
        cloud_job_url: None,
        model_download_url: None,
    }
}

#[test]
fn encuentra_los_pesos_de_cada_layout_de_backend() {
    // Cada backend guarda con un nombre distinto; antes sólo se miraba el de
    // ultralytics y los demás salían sin modelo (y sin botones) en la lista.
    for (relativo, descripcion) in [
        ("weights/best.pt", "ultralytics"),
        ("train_output/best.pth", "smp / timm / pose"),
        ("train_output/best_model.joblib", "sklearn"),
        ("train_output/model.pkl", "pyod / tslearn"),
    ] {
        let tmp = TempDir::new().unwrap();
        let ruta = tmp.path().join(relativo);
        fs::create_dir_all(ruta.parent().unwrap()).unwrap();
        fs::write(&ruta, b"x").unwrap();

        let job = job_con_result_dir(tmp.path());
        let (hay_best, _, best, _) = crate::commands::training_commands::localizar_artefactos(&job);
        assert!(hay_best, "{descripcion}: no se encontró {relativo}");
        assert_eq!(best.unwrap(), ruta.to_string_lossy());
    }
}

#[test]
fn encuentra_pesos_con_extension_añadida() {
    // pypots añade su propia extensión a la ruta pedida.
    let tmp = TempDir::new().unwrap();
    fs::create_dir_all(tmp.path().join("train_output")).unwrap();
    let real = tmp.path().join("train_output/best_model.pypots");
    fs::write(&real, b"x").unwrap();

    let job = job_con_result_dir(tmp.path());
    let (hay_best, _, best, _) = crate::commands::training_commands::localizar_artefactos(&job);
    assert!(hay_best);
    assert_eq!(best.unwrap(), real.to_string_lossy());
}

#[test]
fn sin_artefactos_no_inventa_rutas() {
    let tmp = TempDir::new().unwrap();
    let job = job_con_result_dir(tmp.path());
    let (hay_best, hay_last, best, last) =
        crate::commands::training_commands::localizar_artefactos(&job);
    assert!(!hay_best && !hay_last);
    assert!(best.is_none() && last.is_none());
}

#[test]
fn el_catalogo_publica_el_mismo_minimo_que_valida_el_runner() {
    // El runner rechaza resoluciones por debajo de `min_image_size`; si el catálogo
    // publicara otro valor, la UI dejaría pedir algo que el backend rechaza.
    use crate::training::backends;
    for project_type in [
        "detection",
        "segmentation",
        "classification",
        "keypoints",
        "obb",
    ] {
        for info in backends::get_available_backends(project_type) {
            let esperado = match info.id.as_str() {
                "rt_detr" | "rf_detr" => 320,
                _ => 32,
            };
            assert_eq!(
                info.min_image_size, esperado,
                "{} publica {} px",
                info.id, info.min_image_size
            );
        }
    }
}

// ─── Cloud: ningún proveedor reimplementa el entrenamiento ──────────────────

#[test]
fn los_runners_cloud_no_incrustan_ningun_backend() {
    // Los seis proveedores incrustaban `from ultralytics import YOLO` con los
    // hiperparámetros interpolados: elegir SMP, timm o tsai y ejecutar en la nube
    // entrenaba un YOLO. Ahora todos ejecutan el paquete generado, y este test
    // impide que vuelva a colarse lógica de backend.
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/training/cloud");
    let mut revisados = 0;
    for entrada in fs::read_dir(&dir).expect("leer cloud/") {
        let ruta = entrada.expect("entrada").path();
        if ruta.extension().and_then(|e| e.to_str()) != Some("rs") {
            continue;
        }
        let nombre = ruta.file_name().unwrap().to_string_lossy().to_string();
        // `script.rs` documenta el problema en sus comentarios y lo cubre su propio test.
        if nombre == "script.rs" {
            continue;
        }
        let contenido = fs::read_to_string(&ruta).expect("leer runner");
        revisados += 1;
        for linea in contenido.lines() {
            let codigo = linea.trim_start();
            if codigo.starts_with("//") || codigo.starts_with("///") {
                continue;
            }
            for prohibido in ["from ultralytics", "YOLO(", "model.train("] {
                assert!(
                    !codigo.contains(prohibido),
                    "{nombre} vuelve a incrustar entrenamiento ({prohibido}): la nube \
                     debe ejecutar el paquete generado, no reimplementar el backend"
                );
            }
        }
    }
    assert!(revisados >= 6, "sólo se revisaron {revisados} archivos");
}

// ─── Tests: seguimiento asistido de una caja ────────────────────────────────

use crate::tracking::{simplify_trajectory, track_step, PctBox, PxBox, TrackedBox};

/// Patrón determinista con textura de alta frecuencia y sin periodo corto, para
/// que la correlación tenga un máximo único.
fn textured_frame(width: u32, height: u32, shift_x: i64, shift_y: i64) -> image::GrayImage {
    // Mezcla estilo splitmix64. Un hash multiplicativo simple deja bandas
    // cuasi-periódicas y la correlación encuentra máximos falsos lejos del sitio.
    fn mix(mut v: u64) -> u64 {
        v ^= v >> 30;
        v = v.wrapping_mul(0xbf58476d1ce4e5b9);
        v ^= v >> 27;
        v = v.wrapping_mul(0x94d049bb133111eb);
        v ^ (v >> 31)
    }
    // Ruido suavizado: valores aleatorios en una rejilla de 8 px interpolados
    // bilinealmente. Un fotograma real tiene esta pinta; ruido blanco píxel a
    // píxel no, y con él ninguna búsqueda que submuestree puede funcionar.
    const CELL: f64 = 8.0;
    let node = |gx: i64, gy: i64| -> f64 {
        (mix((gx as u64).wrapping_mul(0x9e3779b97f4a7c15) ^ mix(gy as u64)) >> 56) as f64
    };
    image::GrayImage::from_fn(width, height, |x, y| {
        let sx = (x as i64 - shift_x) as f64 / CELL;
        let sy = (y as i64 - shift_y) as f64 / CELL;
        let (gx, gy) = (sx.floor(), sy.floor());
        let (fx, fy) = (sx - gx, sy - gy);
        let (gx, gy) = (gx as i64, gy as i64);
        let top = node(gx, gy) * (1.0 - fx) + node(gx + 1, gy) * fx;
        let bottom = node(gx, gy + 1) * (1.0 - fx) + node(gx + 1, gy + 1) * fx;
        image::Luma([(top * (1.0 - fy) + bottom * fy) as u8])
    })
}

#[test]
fn track_step_follows_a_translated_patch() {
    let prev = textured_frame(200, 200, 0, 0);
    let next = textured_frame(200, 200, 7, -5);
    let bbox = PxBox {
        x: 60.0,
        y: 60.0,
        w: 40.0,
        h: 40.0,
    };

    let (found, score) = track_step(&prev, &next, bbox).expect("región con textura");
    assert!(
        score > 0.9,
        "el encaje exacto debería puntuar alto: {}",
        score
    );
    assert!((found.x - 67.0).abs() <= 1.0, "x = {}", found.x);
    assert!((found.y - 55.0).abs() <= 1.0, "y = {}", found.y);
}

#[test]
fn track_step_gives_up_on_a_flat_region() {
    // Sin textura el mejor encaje es ruido: proponer una caja ahí sería escribir
    // una posición inventada en el dataset.
    let flat = image::GrayImage::from_pixel(120, 120, image::Luma([128]));
    let bbox = PxBox {
        x: 20.0,
        y: 20.0,
        w: 40.0,
        h: 40.0,
    };
    assert!(track_step(&flat, &flat, bbox).is_none());
}

#[test]
fn track_step_rejects_a_box_too_small_to_correlate() {
    let prev = textured_frame(100, 100, 0, 0);
    let bbox = PxBox {
        x: 10.0,
        y: 10.0,
        w: 2.0,
        h: 2.0,
    };
    assert!(track_step(&prev, &prev, bbox).is_none());
}

fn tracked(frame_index: i64, x: f64, y: f64) -> TrackedBox {
    TrackedBox {
        frame_index,
        bbox: PctBox {
            x,
            y,
            w: 10.0,
            h: 10.0,
        },
    }
}

#[test]
fn simplify_drops_what_linear_interpolation_already_reproduces() {
    // Movimiento en línea recta a velocidad constante: dos keyframes bastan.
    let samples: Vec<TrackedBox> = (0..20)
        .map(|i| tracked(i, i as f64, i as f64 * 2.0))
        .collect();
    let kept = simplify_trajectory(&samples, 0.5);
    assert_eq!(kept.len(), 2);
    assert_eq!(kept[0].frame_index, 0);
    assert_eq!(kept[1].frame_index, 19);
}

#[test]
fn simplify_keeps_the_turn() {
    // Un giro en el fotograma 10 no lo reconstruye ninguna recta: tiene que
    // sobrevivir a la simplificación.
    let mut samples: Vec<TrackedBox> = (0..=10).map(|i| tracked(i, i as f64, 0.0)).collect();
    samples.extend((11..=20).map(|i| tracked(i, 10.0, (i - 10) as f64)));

    let kept = simplify_trajectory(&samples, 0.5);
    assert!(
        kept.iter().any(|s| s.frame_index == 10),
        "el vértice del giro debe quedarse: {:?}",
        kept.iter().map(|s| s.frame_index).collect::<Vec<_>>()
    );
    assert!(kept.len() < samples.len() / 2, "y el resto debe caer");
}

#[test]
fn simplify_respects_the_tolerance() {
    // Desviación de 2 puntos porcentuales en el centro: se conserva con una
    // tolerancia de 0.5 y se descarta con una de 5.
    let samples = vec![
        tracked(0, 0.0, 0.0),
        tracked(5, 5.0, 2.0),
        tracked(10, 10.0, 0.0),
    ];
    assert_eq!(simplify_trajectory(&samples, 0.5).len(), 3);
    assert_eq!(simplify_trajectory(&samples, 5.0).len(), 2);
}

// ─── Tests: catálogo de familias de modelos ─────────────────────────────────

/// Todo modelo publicado tiene que tener ficha de decisión, y toda ficha tiene que
/// corresponder a un modelo real. Sin esto, agregar un modelo con una familia nueva
/// deja un hueco silencioso en la UI: el usuario ve el modelo y no ve con qué
/// criterio elegirlo.
#[test]
fn cada_familia_publicada_tiene_ficha_y_cada_ficha_tiene_modelos() {
    use crate::training::{backends, catalog};
    use std::collections::BTreeSet;

    // Todos los tipos de proyecto, para barrer los 17 backends.
    const TIPOS: &[&str] = &[
        "bbox",
        "mask",
        "polygon",
        "instance-segmentation",
        "keypoints",
        "landmarks",
        "obb",
        "classification",
        "multi-label-classification",
        "timeseries-classification",
        "timeseries-forecasting",
        "anomaly-detection",
        "timeseries-segmentation",
        "pattern-recognition",
        "event-detection",
        "timeseries-regression",
        "clustering",
        "imputation",
        "tabular",
    ];

    let mut publicadas: BTreeSet<(String, String)> = BTreeSet::new();
    for tipo in TIPOS {
        for backend in backends::get_available_backends(tipo) {
            for modelo in &backend.models {
                publicadas.insert((backend.id.clone(), modelo.family.clone()));
            }
        }
    }
    assert!(
        publicadas.len() > 50,
        "el barrido de tipos de proyecto sólo encontró {} familias; \
         ¿se dejó fuera algún backend?",
        publicadas.len()
    );

    let fichadas: BTreeSet<(String, String)> = catalog::families()
        .into_iter()
        .map(|f| (f.backend, f.family))
        .collect();

    let sin_ficha: Vec<_> = publicadas.difference(&fichadas).collect();
    assert!(
        sin_ficha.is_empty(),
        "estas familias se publican en el selector y no tienen ficha en \
         training/catalog.rs: {sin_ficha:?}"
    );

    let huerfanas: Vec<_> = fichadas.difference(&publicadas).collect();
    assert!(
        huerfanas.is_empty(),
        "estas fichas no corresponden a ningún modelo publicado: {huerfanas:?}"
    );
}

/// Los valores de los ejes son un vocabulario cerrado: la UI traduce y agrupa por
/// ellos, así que un valor suelto no se muestra mal — desaparece.
#[test]
fn las_fichas_usan_el_vocabulario_esperado() {
    use crate::training::catalog;

    const DOMINIOS: &[&str] = &["general", "biomedical"];
    const VRAM: &[&str] = &["le4gb", "4to8gb", "8to16gb", "gt16gb"];
    const VELOCIDAD: &[&str] = &["fast", "medium", "slow"];
    const ACCESO: &[&str] = &["open", "gated", "non_commercial"];
    const MODALIDADES: &[&str] = &[
        "any",
        "series",
        "tabular",
        "ct",
        "mri",
        "xray",
        "microscopy",
        "wsi",
        "fundus",
        "oct",
        "ultrasound",
        "ecg",
        "eeg",
    ];

    for f in catalog::families() {
        let k = &f.key;
        assert!(!f.domains.is_empty(), "{k}: sin dominio");
        for d in &f.domains {
            assert!(
                DOMINIOS.contains(&d.as_str()),
                "{k}: dominio '{d}' no válido"
            );
        }
        assert!(!f.modalities.is_empty(), "{k}: sin modalidad");
        for m in &f.modalities {
            assert!(
                MODALIDADES.contains(&m.as_str()),
                "{k}: modalidad '{m}' no válida"
            );
        }
        assert!(
            VRAM.contains(&f.vram.as_str()),
            "{k}: vram '{}' no válida",
            f.vram
        );
        assert!(
            VELOCIDAD.contains(&f.speed.as_str()),
            "{k}: velocidad '{}' no válida",
            f.speed
        );
        assert!(
            ACCESO.contains(&f.access.as_str()),
            "{k}: acceso '{}' no válido",
            f.access
        );
        assert!(f.min_samples > 0, "{k}: min_samples en 0 no orienta nada");
        assert!(!f.license.is_empty(), "{k}: sin licencia");
        assert!(
            !f.pretrained_on.is_empty(),
            "{k}: sin origen de preentrenamiento"
        );
    }
}

/// La clave es el par (backend, familia) y no la familia sola, porque `resnet` en
/// `timm` clasifica imágenes y `resnet` en `tsai` es una red 1D para series.
#[test]
fn una_misma_familia_en_dos_backends_son_fichas_distintas() {
    use crate::training::catalog;

    let resnet: Vec<_> = catalog::families()
        .into_iter()
        .filter(|f| f.family == "resnet")
        .collect();
    assert!(
        resnet.len() >= 2,
        "se esperaban varias fichas 'resnet' en backends distintos"
    );
    let modalidades: Vec<_> = resnet.iter().map(|f| f.modalities.clone()).collect();
    assert!(
        modalidades.iter().any(|m| m.contains(&"any".to_string()))
            && modalidades
                .iter()
                .any(|m| m.contains(&"series".to_string())),
        "las fichas 'resnet' no distinguen imagen de serie temporal: {modalidades:?}"
    );
}
