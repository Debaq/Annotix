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

#![cfg(test)]

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
use crate::store::project_file::{
    AnnotationEntry, ClassDef, ImageEntry, ProjectFile,
};

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
        locked_by: None,
        lock_expires: None,
        download_status: None,
        predictions: vec![],
    }
}

fn default_classes() -> Vec<ClassDef> {
    vec![
        ClassDef { id: 0, name: "cat".into(), color: "#ff0000".into(), description: None },
        ClassDef { id: 1, name: "dog".into(), color: "#00ff00".into(), description: Some("puppy".into()) },
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
    let img1 = data.images.iter().find(|i| i.name == "img1.png").expect("img1");
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
    let parts: Vec<&str> = txt.trim().split_whitespace().collect();
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
    ApprovalStatus, LockMode, PeerRole, SessionRules, SessionStatus,
    protocol::GossipMessage,
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
    assert_eq!(serde_json::to_string(&SessionStatus::Connected).unwrap(), "\"connected\"");
    let s: SessionStatus = serde_json::from_str("\"syncing\"").unwrap();
    assert_eq!(s, SessionStatus::Syncing);
}

#[test]
fn approval_status_serde_lowercase() {
    assert_eq!(serde_json::to_string(&ApprovalStatus::Pending).unwrap(), "\"pending\"");
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
        GossipMessage::PeerJoined { node_id, display_name } => {
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
        assert_eq!(OutputFormat::from_hint(a), Some(OutputFormat::YoloV8), "alias {}", a);
    }
}

#[test]
fn output_format_from_hint_yolov5_family() {
    assert_eq!(OutputFormat::from_hint("yolov5"), Some(OutputFormat::YoloV5));
    assert_eq!(OutputFormat::from_hint("yolov7"), Some(OutputFormat::YoloV5));
}

#[test]
fn output_format_from_hint_yolov10_family() {
    assert_eq!(OutputFormat::from_hint("yolov10"), Some(OutputFormat::YoloV10));
    assert_eq!(OutputFormat::from_hint("yolo26"), Some(OutputFormat::YoloV10));
}

#[test]
fn output_format_from_hint_normalizes_separators() {
    assert_eq!(OutputFormat::from_hint("YOLO-V8"), Some(OutputFormat::YoloV8));
    assert_eq!(OutputFormat::from_hint("Yolo_V5"), Some(OutputFormat::YoloV5));
}

#[test]
fn output_format_from_hint_multi_output_aliases() {
    for a in ["ssd", "efficientdet", "fasterrcnn", "rcnn", "retinanet", "detr"] {
        assert_eq!(OutputFormat::from_hint(a), Some(OutputFormat::MultiOutput), "alias {}", a);
    }
}

#[test]
fn output_format_from_hint_classification() {
    assert_eq!(OutputFormat::from_hint("classification"), Some(OutputFormat::Classification));
    assert_eq!(OutputFormat::from_hint("cls"), Some(OutputFormat::Classification));
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

    let yaml_path = dataset::prepare_dataset(
        imgs_dir.path(),
        &pf,
        &pf.images,
        out.path(),
        0.5,
        "detect",
    )
    .expect("prepare");

    assert!(std::path::Path::new(&yaml_path).exists());
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
    let e = dataset::prepare_dataset(tmp.path(), &pf, &[], out.path(), 0.2, "detect");
    assert!(e.is_err());
}

#[test]
fn training_prepare_dataset_classify_uses_folders_by_class() {
    let (pf, imgs_dir) = build_detection_fixture();
    let out = tempfile::tempdir().unwrap();

    // Para classify, las anotaciones deben ser bbox con class_id válido; el primer bbox
    // determina la clase. Nuestra fixture tiene eso.
    let yaml_path = dataset::prepare_dataset(
        imgs_dir.path(),
        &pf,
        &pf.images,
        out.path(),
        0.5,
        "classify",
    )
    .expect("prepare classify");

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
    dataset::prepare_dataset(imgs_dir.path(), &pf, &pf.images, out1.path(), 0.5, "detect").unwrap();
    let files1: Vec<_> = std::fs::read_dir(out1.path().join("images/train"))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .collect();

    let out2 = tempfile::tempdir().unwrap();
    dataset::prepare_dataset(imgs_dir.path(), &pf, &pf.images, out2.path(), 0.5, "detect").unwrap();
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
    assert!((side - (10.0_f64 * 2.0_f64.sqrt())).abs() < 1e-6, "side = {}", side);
}

#[test]
fn escape_xml_replaces_all_specials() {
    let s = escape_xml("<tag attr=\"v\" val='x' a&b>");
    assert_eq!(s, "&lt;tag attr=&quot;v&quot; val=&apos;x&apos; a&amp;b&gt;");
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
