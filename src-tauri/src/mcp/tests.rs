//! Tests del servidor MCP: una herramienta cada uno, más los dos que importan:
//! el cegado no filtra anotaciones y el import es idempotente.

use image::{ImageBuffer, Rgb};
use serde_json::{json, Value};
use tempfile::TempDir;

use super::meta::asignar;
use super::ops::call;
use crate::store::project_file::{AnnotationEntry, ReadingLayer};
use crate::store::state::AppState;

struct Entorno {
    _tmp: TempDir,
    imgs: std::path::PathBuf,
    state: AppState,
}

fn entorno(n_imgs: u32) -> Entorno {
    let tmp = TempDir::new().unwrap();
    let data = tmp.path().join("data");
    let proyectos = tmp.path().join("proyectos");
    let imgs = tmp.path().join("imgs");
    std::fs::create_dir_all(&proyectos).unwrap();
    std::fs::create_dir_all(&imgs).unwrap();
    let state = AppState::with_data_dir(data).unwrap();
    state.config.lock().unwrap().projects_dir = Some(proyectos);
    for i in 0..n_imgs {
        let img: ImageBuffer<Rgb<u8>, Vec<u8>> =
            ImageBuffer::from_fn(16, 16, |x, _| Rgb([(i * 20) as u8, x as u8, 7]));
        img.save(imgs.join(format!("img{i}.png"))).unwrap();
    }
    Entorno { _tmp: tmp, imgs, state }
}

fn clases() -> Value {
    json!([{"id":1,"name":"optic_disc","color":"#f00"},{"id":2,"name":"fovea","color":"#0f0"},
           {"id":3,"name":"microaneurysm","color":"#00f"}])
}

fn crear(e: &Entorno, replication: u32, blind: bool) -> String {
    call(&e.state, "project_create",
         &json!({"name":"dird","classes":clases(),"replication":replication,"blind":blind}))
        .unwrap()["project_id"].as_str().unwrap().to_string()
}

fn anotacion(id: &str, clase: i64, x: f64) -> AnnotationEntry {
    serde_json::from_value(json!({"id":id,"type":"bbox","classId":clase,
        "data":{"x":x,"y":2.0,"width":6.0,"height":6.0}})).unwrap()
}

fn capa(lector: &str, status: &str, anns: Vec<AnnotationEntry>) -> ReadingLayer {
    ReadingLayer { author_id: lector.into(), author_name: Some(lector.into()), annotations: anns,
                   status: status.into(), submitted_at: None, updated_at: None }
}

/// Simula lo que haría la UI de dos lectores: escribe sus capas en el proyecto.
fn poner_lecturas(e: &Entorno, pid: &str, entregadas: bool) {
    e.state.evict_from_cache(pid);
    e.state.with_project_mut(pid, |pf| {
        let st = if entregadas { "submitted" } else { "in_progress" };
        for (k, img) in pf.images.iter_mut().enumerate() {
            img.readings = vec![
                capa("ana", st, vec![anotacion(&format!("a{k}"), 1, 2.0)]),
                capa("beto", st, vec![anotacion(&format!("b{k}"), 2, 9.0)]),
            ];
        }
    }).unwrap();
}

#[test]
fn project_create_es_idempotente_y_guarda_reglas() {
    let e = entorno(0);
    let a = crear(&e, 2, true);
    let b = crear(&e, 2, true);
    assert_eq!(a, b);
    let l = call(&e.state, "project_list", &json!({})).unwrap();
    assert_eq!(l.as_array().unwrap().len(), 1);
    let s = call(&e.state, "project_status", &json!({"project":"dird"})).unwrap();
    assert_eq!(s["replication"], 2);
    assert_eq!(s["blind"], true);
    assert_eq!(s["n_classes"], 3);
    // mismas clases distintas → se niega
    let r = call(&e.state, "project_create", &json!({"name":"dird","classes":[{"id":9,"name":"x"}]}));
    assert!(r.is_err());
}

#[test]
fn import_images_deduplica_y_es_idempotente() {
    let e = entorno(4);
    let pid = crear(&e, 1, false);
    let args = json!({"project":pid,"dir":e.imgs.to_str().unwrap()});
    let r1 = call(&e.state, "import_images", &args).unwrap();
    assert_eq!(r1["imported"], 4);
    let r2 = call(&e.state, "import_images", &args).unwrap();
    assert_eq!(r2["imported"], 0);
    assert_eq!(r2["skipped_duplicates"], 4);
    let n = e.state.with_project(&pid, |pf| pf.images.len()).unwrap();
    assert_eq!(n, 4, "repetir el import no duplica");
    // un archivo con otro nombre pero mismos bytes también se omite
    std::fs::copy(e.imgs.join("img0.png"), e.imgs.join("copia.png")).unwrap();
    let r3 = call(&e.state, "import_images", &args).unwrap();
    assert_eq!(r3["imported"], 0);
}

#[test]
fn import_images_modo_symlink_y_csv() {
    let e = entorno(2);
    let pid = crear(&e, 1, false);
    let csv = e.imgs.join("lista.csv");
    std::fs::write(&csv, "path\nimg0.png\nimg1.png\n").unwrap();
    let r = call(&e.state, "import_images",
        &json!({"project":pid,"manifest_csv":csv.to_str().unwrap(),"mode":"symlink"})).unwrap();
    assert_eq!(r["imported"], 2);
    let dir = e.state.project_images_dir(&pid).unwrap();
    let enlaces = std::fs::read_dir(dir).unwrap().flatten()
        .filter(|f| f.path().is_symlink()).count();
    assert_eq!(enlaces, 2);
}

#[test]
fn prelabels_no_son_lecturas_y_no_se_duplican() {
    let e = entorno(2);
    let pid = crear(&e, 2, true);
    call(&e.state, "import_images", &json!({"project":pid,"dir":e.imgs.to_str().unwrap()})).unwrap();
    let coco = e.imgs.join("pre.json");
    std::fs::write(&coco, json!({
        "images":[{"id":1,"file_name":"img0.png"},{"id":2,"file_name":"img1.png"}],
        "annotations":[
          {"image_id":1,"category_id":1,"bbox":[1,2,5,5],"score":0.9},
          {"image_id":2,"category_id":2,"bbox":[3,3,4,4]},
          {"image_id":2,"category_id":99,"bbox":[3,3,4,4]},
          {"image_id":7,"category_id":1,"bbox":[3,3,4,4]}]}).to_string()).unwrap();
    let args = json!({"project":pid,"coco_json":coco.to_str().unwrap(),
                      "origin":"detection","model_version":"v2.0.0","status":"prelabel"});
    let r = call(&e.state, "import_annotations", &args).unwrap();
    assert_eq!(r["imported"], 2);
    assert_eq!(r["unknown_class"], 1);
    assert_eq!(r["unmatched_images"], 1);
    assert_eq!(r["origin"], "detection-v2.0.0");
    let r2 = call(&e.state, "import_annotations", &args).unwrap();
    assert_eq!(r2["imported"], 0);
    assert_eq!(r2["skipped_duplicates"], 2);
    e.state.with_project(&pid, |pf| {
        for i in &pf.images {
            assert!(i.annotations.is_empty(), "una pre-etiqueta no es una anotación");
            assert!(i.readings.is_empty(), "ni una lectura");
            assert!(i.predictions.iter().all(|p| p.status == "prelabel" && p.model_id == "detection-v2.0.0"));
        }
    }).unwrap();
    // filtros por clase y prefijo, y procedencia con sha256
    let f = json!({"project":pid,"coco_json":coco.to_str().unwrap(),"origin":"ddr-official",
        "model_version":"v1","class_ids":[1],"name_prefixes":["img1"],"model_sha256":"abc"});
    let r3 = call(&e.state, "import_annotations", &f).unwrap();
    assert_eq!(r3["imported"], 0, "img1 sólo tiene clase 2 y 99: nada pasa el filtro");
    assert_eq!(r3["filtered_out"], 3);
    let meta = crate::mcp::meta::McpMeta::load(&e.state.project_dir(&pid).unwrap()).unwrap();
    assert_eq!(meta.prelabel_sources.len(), 2);
    assert_eq!(meta.prelabel_sources[1]["sha256"], "abc");
    // y no se puede importar como otra cosa
    let mal = json!({"project":pid,"coco_json":coco.to_str().unwrap(),"origin":"x","model_version":"1","status":"submitted"});
    assert!(call(&e.state, "import_annotations", &mal).is_err());
}

#[test]
fn asignacion_reproducible_y_equilibrada() {
    let ids: Vec<String> = (0..20).map(|i| format!("i{i}")).collect();
    let lect = vec!["ana".to_string(), "beto".to_string(), "carla".to_string()];
    let a = asignar(&ids, &lect, 2, 42).unwrap();
    let mut barajado = ids.clone();
    barajado.reverse();
    assert_eq!(a, asignar(&barajado, &lect, 2, 42).unwrap(), "no depende del orden de entrada");
    assert_ne!(a, asignar(&ids, &lect, 2, 43).unwrap());
    assert!(a.values().all(|v| v.len() == 2 && v[0] != v[1]));
    let carga = |l: &str| a.values().filter(|v| v.iter().any(|x| x == l)).count();
    assert!(lect.iter().all(|l| (12..=14).contains(&carga(l))));
    assert!(asignar(&ids, &lect[..1].to_vec(), 2, 1).is_err());
}

#[test]
fn session_create_reparte_y_es_idempotente() {
    let e = entorno(6);
    let pid = crear(&e, 2, true);
    call(&e.state, "import_images", &json!({"project":pid,"dir":e.imgs.to_str().unwrap()})).unwrap();
    let args = json!({"project":pid,"readers":["ana","beto"],"assignment_seed":7});
    let r = call(&e.state, "session_create", &args).unwrap();
    assert_eq!(r["created"], true);
    assert_eq!(r["assigned_by_reader"]["ana"], 6);
    let r2 = call(&e.state, "session_create", &args).unwrap();
    assert_eq!(r2["created"], false);
    let otra = json!({"project":pid,"readers":["ana","carla"],"assignment_seed":7});
    assert!(call(&e.state, "session_create", &otra).is_err());
    let s = call(&e.state, "project_status", &json!({"project":pid})).unwrap();
    assert_eq!(s["progress_by_reader"]["beto"]["assigned"], 6);
    assert_eq!(s["pending_images"], 6);
}

/// Con la sesión ciega sin resolver, ninguna herramienta devuelve nada que
/// permita reconstruir lo que anotó un lector.
#[test]
fn modo_ciego_no_filtra_anotaciones() {
    let e = entorno(3);
    let pid = crear(&e, 2, true);
    call(&e.state, "import_images", &json!({"project":pid,"dir":e.imgs.to_str().unwrap()})).unwrap();
    call(&e.state, "session_create", &json!({"project":pid,"readers":["ana","beto"],"assignment_seed":1})).unwrap();
    poner_lecturas(&e, pid.as_str(), true);

    let mut salidas = vec![];
    for (t, extra) in [("project_status", json!({})), ("agreement_report", json!({})),
                       ("conflicts_list", json!({})), ("audit_read", json!({}))] {
        let mut a = json!({"project":pid});
        a.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
        salidas.push((t, call(&e.state, t, &a).unwrap().to_string()));
    }
    for (t, s) in &salidas {
        for pista in ["\"data\"", "\"classId\"", "\"width\"", "\"a0\"", "\"b0\"", "\"annotations\"",
                      "\"readings\"", "iou_mean", "presence_kappa", "disagreement", "class_conflicts"] {
            assert!(!s.contains(pista), "{t} filtra '{pista}': {s}");
        }
    }
    let c = call(&e.state, "conflicts_list", &json!({"project":pid})).unwrap();
    assert_eq!(c["blind_locked"], true);
    assert_eq!(c["n_conflicts"], 3);
    // y el export con 'all' tampoco saca la capa de nadie
    let x = call(&e.state, "export", &json!({"project":pid,"only":"all"}));
    assert!(x.is_err(), "ciego sin resolver: nada exportable: {x:?}");
}

#[test]
fn al_adjudicar_se_levanta_el_cegado_y_hay_informe() {
    let e = entorno(2);
    let pid = crear(&e, 2, true);
    call(&e.state, "import_images", &json!({"project":pid,"dir":e.imgs.to_str().unwrap()})).unwrap();
    call(&e.state, "session_create", &json!({"project":pid,"readers":["ana","beto"],"assignment_seed":1})).unwrap();
    poner_lecturas(&e, &pid, true);
    // Lo hace la UI del adjudicador, no el MCP.
    let ids: Vec<String> = e.state.with_project(&pid, |pf| pf.images.iter().map(|i| i.id.clone()).collect()).unwrap();
    for i in &ids {
        e.state.adjudicate_image(&pid, i, vec![anotacion("z", 1, 2.0)], "dra").unwrap();
    }
    let r = call(&e.state, "agreement_report", &json!({"project":pid})).unwrap();
    assert_eq!(r["blind_locked"], false);
    let por = r["by_class"].as_array().unwrap();
    assert_eq!(por.len(), 3);
    assert_eq!(por[0]["class"], "optic_disc");
    assert!(por[0]["presence_kappa"].is_null() || por[0]["presence_kappa"].is_number());
    let c = call(&e.state, "conflicts_list", &json!({"project":pid})).unwrap();
    assert_eq!(c["blind_locked"], false);
    assert!(c["conflicts"].as_array().unwrap().len() == 2);
}

#[test]
fn export_coco_con_audit_y_verificacion() {
    let e = entorno(2);
    let pid = crear(&e, 2, true);
    call(&e.state, "import_images", &json!({"project":pid,"dir":e.imgs.to_str().unwrap()})).unwrap();
    call(&e.state, "session_create", &json!({"project":pid,"readers":["ana","beto"],"assignment_seed":1})).unwrap();
    poner_lecturas(&e, &pid, true);
    let ids: Vec<String> = e.state.with_project(&pid, |pf| pf.images.iter().map(|i| i.id.clone()).collect()).unwrap();
    for i in &ids {
        e.state.adjudicate_image(&pid, i, vec![anotacion("z", 1, 2.0)], "dra").unwrap();
    }
    let r = call(&e.state, "export", &json!({"project":pid,"format":"coco","only":"adjudicated","include_audit":true})).unwrap();
    assert_eq!(r["n_images"], 2);
    let f = std::fs::File::open(r["file"].as_str().unwrap()).unwrap();
    let mut z = zip::ZipArchive::new(f).unwrap();
    let nombres: Vec<String> = (0..z.len()).map(|i| z.by_index(i).unwrap().name().to_string()).collect();
    assert!(nombres.iter().any(|n| n == "audit.jsonl"), "{nombres:?}");
    assert!(nombres.iter().any(|n| n.contains("annotations.json")), "{nombres:?}");

    let v = call(&e.state, "audit_verify", &json!({"project":pid})).unwrap();
    assert_eq!(v["report"]["valid"], true);
}

#[test]
fn cada_accion_queda_en_audit_con_actor_agent_mcp() {
    let e = entorno(2);
    let pid = crear(&e, 1, false);
    call(&e.state, "import_images", &json!({"project":pid,"dir":e.imgs.to_str().unwrap()})).unwrap();
    call(&e.state, "project_status", &json!({"project":pid})).unwrap();
    let _ = call(&e.state, "export", &json!({"project":pid}));
    let r = call(&e.state, "audit_read", &json!({"project":pid})).unwrap();
    let evs = r["events"].as_array().unwrap();
    let mcp: Vec<&Value> = evs.iter().filter(|x| x["event"] == "mcp.action").collect();
    let tools: Vec<&str> = mcp.iter().map(|x| x["payload"]["tool"].as_str().unwrap()).collect();
    for t in ["project_create", "import_images", "project_status", "export"] {
        assert!(tools.contains(&t), "falta {t} en {tools:?}");
    }
    assert!(mcp.iter().all(|x| x["actor"] == "agent:mcp"));
    let imp = mcp.iter().find(|x| x["payload"]["tool"] == "import_images").unwrap();
    assert!(imp["payload"]["args"]["dir"].is_string(), "los argumentos quedan");
    let desde = call(&e.state, "audit_read", &json!({"project":pid,"since":3})).unwrap();
    assert!(desde["n"].as_u64().unwrap() < r["n"].as_u64().unwrap());
    let v = call(&e.state, "audit_verify", &json!({"project":pid})).unwrap();
    assert_eq!(v["report"]["valid"], true);
}

#[test]
fn destructivas_exigen_confirm() {
    let e = entorno(2);
    let pid = crear(&e, 2, false);
    call(&e.state, "import_images", &json!({"project":pid,"dir":e.imgs.to_str().unwrap()})).unwrap();
    call(&e.state, "session_create", &json!({"project":pid,"readers":["ana","beto"],"assignment_seed":1})).unwrap();
    let id0: String = e.state.with_project(&pid, |pf| pf.images[0].id.clone()).unwrap();

    assert!(call(&e.state, "images_delete", &json!({"project":pid,"image_ids":[id0]})).is_err());
    assert!(call(&e.state, "session_close", &json!({"project":pid})).is_err());
    assert!(call(&e.state, "project_delete", &json!({"project":pid,"confirm":false})).is_err());
    assert_eq!(e.state.with_project(&pid, |pf| pf.images.len()).unwrap(), 2);

    let r = call(&e.state, "images_delete", &json!({"project":pid,"image_ids":[id0],"confirm":true})).unwrap();
    assert_eq!(r["deleted"], 1);
    call(&e.state, "session_close", &json!({"project":pid,"confirm":true})).unwrap();
    let a = call(&e.state, "audit_read", &json!({"project":pid})).unwrap();
    let tools: Vec<String> = a["events"].as_array().unwrap().iter()
        .filter(|x| x["event"] == "mcp.action")
        .map(|x| format!("{}:{}", x["payload"]["tool"].as_str().unwrap(), x["payload"]["ok"])).collect();
    assert!(tools.contains(&"images_delete:false".to_string()));
    assert!(tools.contains(&"images_delete:true".to_string()));

    call(&e.state, "project_delete", &json!({"project":pid,"confirm":true})).unwrap();
    assert!(call(&e.state, "project_status", &json!({"project":pid})).is_err());
    let traza = std::fs::read_to_string(e.state.data_dir.join("mcp_deleted_projects.jsonl")).unwrap();
    assert!(traza.contains(&pid));
}

#[test]
fn no_hay_herramientas_de_anotacion_ni_adjudicacion() {
    let nombres: Vec<String> = super::server::herramientas().iter()
        .map(|t| t["name"].as_str().unwrap().to_string()).collect();
    for n in &nombres {
        for prohibido in ["annotation_save", "annotations_save", "annotate", "adjudicate", "annotation_delete", "reading"] {
            assert!(!n.contains(prohibido), "{n}");
        }
    }
    let e = entorno(0);
    for t in ["annotation_save", "adjudicate", "annotations_delete"] {
        assert!(call(&e.state, t, &json!({})).is_err());
    }
}

#[test]
fn protocolo_jsonrpc_basico() {
    let e = entorno(0);
    let r = super::server::manejar(&e.state, &json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{}})).unwrap();
    assert_eq!(r["result"]["serverInfo"]["name"], "annotix-mcp");
    let l = super::server::manejar(&e.state, &json!({"jsonrpc":"2.0","id":2,"method":"tools/list"})).unwrap();
    assert_eq!(l["result"]["tools"].as_array().unwrap().len(), 14);
    assert!(super::server::manejar(&e.state, &json!({"jsonrpc":"2.0","method":"notifications/initialized"})).is_none());
    let c = super::server::manejar(&e.state, &json!({"jsonrpc":"2.0","id":3,"method":"tools/call",
        "params":{"name":"project_list","arguments":{}}})).unwrap();
    assert_eq!(c["result"]["isError"], false);
}

/// El COCO del bundle cita `ddr__x.png`; la imagen puede llamarse `x.png` (importada
/// antes) o `ddr__x.png` (importada por symlink): las dos casan.
#[test]
fn prelabels_casan_con_el_prefijo_dataset() {
    let e = entorno(1);
    let pid = crear(&e, 1, false);
    let enlace = e.imgs.join("ddr__x.png");
    std::os::unix::fs::symlink(e.imgs.join("img0.png"), &enlace).unwrap();
    call(&e.state, "import_images", &json!({"project":pid,"dir":e.imgs.to_str().unwrap(),"mode":"symlink"})).unwrap();
    let nombre = e.state.with_project(&pid, |pf| pf.images[0].name.clone()).unwrap();
    assert_eq!(nombre, "ddr__x.png", "el nombre es el del enlace");
    let coco = e.imgs.join("p.json");
    std::fs::write(&coco, json!({"images":[{"id":1,"file_name":"ddr__x.png"}],
        "annotations":[{"image_id":1,"category_id":1,"bbox":[1,1,4,4]}]}).to_string()).unwrap();
    let r = call(&e.state, "import_annotations", &json!({"project":pid,"coco_json":coco.to_str().unwrap(),
        "origin":"o","model_version":"v"})).unwrap();
    assert_eq!(r["imported"], 1);
}
