//! Lo que hay que probar: que el intervalo se ensanche cuando las muestras
//! vienen de pocos sujetos, que una columna ausente no invente un cero, y que
//! precisión y recall sean razones de sumas y no medias de razones.

use super::*;

fn csv(texto: &str) -> Vec<Muestra> {
    parsear(texto)
}

#[test]
fn el_csv_se_lee_con_las_columnas_que_traiga() {
    let m = csv(
        "sample,subject,correct,iou\n\
         a.png,PAC-1,1,0.80\n\
         b.png,PAC-2,0,0.40\n",
    );
    assert_eq!(m.len(), 2);
    assert_eq!(m[0].sample, "a.png");
    assert_eq!(m[0].subject.as_deref(), Some("PAC-1"));
    assert_eq!(m[0].correct, Some(1.0));
    assert_eq!(m[1].iou, Some(0.4));
    // Lo que el backend no midió no está: ni como cero ni como nada.
    assert_eq!(m[0].dice, None);
    assert_eq!(m[0].tp, None);
}

#[test]
fn una_celda_vacia_no_es_un_cero() {
    // Un cero contaría como acierto fallido y torcería la media hacia abajo.
    let m = csv("sample,correct\na.png,1\nb.png,\n");
    assert_eq!(m[1].correct, None);
    let est = estimaciones(&m);
    assert_eq!(est["accuracy"].value, 1.0);
    assert_eq!(est["accuracy"].n, 1);
}

#[test]
fn una_columna_que_no_se_reconoce_se_ignora() {
    let m = csv("sample,loss_extranio,correct\na.png,3.2,1\n");
    assert_eq!(m.len(), 1);
    assert_eq!(m[0].correct, Some(1.0));
}

#[test]
fn sin_columnas_medibles_no_sale_ninguna_metrica() {
    let est = estimaciones(&csv("sample,subject\na.png,PAC-1\n"));
    assert!(est.is_empty(), "{est:?}");
}

#[test]
fn la_exactitud_sale_con_su_intervalo() {
    let filas: String = (0..40)
        .map(|i| format!("m{i}.png,PAC-{i},{}\n", i % 4 != 0))
        .collect::<Vec<_>>()
        .join("")
        .replace("true", "1")
        .replace("false", "0");
    let est = estimaciones(&csv(&format!("sample,subject,correct\n{filas}")));
    let a = &est["accuracy"];
    assert!((a.value - 0.75).abs() < 1e-9);
    assert_eq!(a.n, 40);
    assert_eq!(a.groups, 40);
    let (bajo, alto) = (a.ci_low.unwrap(), a.ci_high.unwrap());
    assert!(bajo < a.value && a.value < alto, "{a:?}");
}

#[test]
fn menos_sujetos_dan_un_intervalo_mas_ancho() {
    // Es la razón de remuestrear por sujeto: doce imágenes de un paciente no son
    // doce observaciones independientes, y tratarlas como si lo fueran estrecha
    // el intervalo hasta que deja de decir la verdad.
    let ancho = |m: &[Muestra]| {
        let e = estimaciones(m);
        let a = &e["accuracy"];
        a.ci_high.unwrap() - a.ci_low.unwrap()
    };

    // El mismo 75 % de aciertos en los dos casos. La diferencia es de dónde
    // vienen los fallos: repartidos entre cuarenta pacientes, o todos del mismo
    // —que es lo que pasa de verdad cuando un paciente se sale del protocolo—.
    let independientes: String = (0..40)
        .map(|i| format!("m{i}.png,PAC-{i},{}\n", u8::from(i % 4 != 0)))
        .collect();
    let agrupadas: String = (0..40)
        .map(|i| format!("m{i}.png,PAC-{},{}\n", i / 10, u8::from(i >= 10)))
        .collect();

    let a = ancho(&csv(&format!("sample,subject,correct\n{independientes}")));
    let b = ancho(&csv(&format!("sample,subject,correct\n{agrupadas}")));
    assert!(
        b > a,
        "cuatro sujetos tienen que dar más incertidumbre que cuarenta: {b} vs {a}"
    );
}

#[test]
fn las_muestras_sin_sujeto_cuentan_como_grupos_sueltos() {
    // Meterlas todas en un grupo «sin sujeto» las trataría como si vinieran del
    // mismo paciente, y el intervalo saldría absurdamente ancho.
    let filas: String = (0..20)
        .map(|i| format!("m{i}.png,,{}\n", u8::from(i % 2 == 0)))
        .collect();
    let est = estimaciones(&csv(&format!("sample,subject,correct\n{filas}")));
    assert_eq!(est["accuracy"].groups, 20);
}

#[test]
fn precision_y_recall_son_razones_de_sumas() {
    // La media de las precisiones por imagen le daría el mismo peso a una imagen
    // con un objeto que a una con cuarenta.
    let m = csv(
        "sample,subject,tp,fp,fn\n\
         a.png,PAC-1,1,1,0\n\
         b.png,PAC-2,40,0,10\n",
    );
    let est = estimaciones(&m);
    // 41 / 42, no la media de 0.5 y 1.0.
    assert!((est["precision"].value - 41.0 / 42.0).abs() < 1e-9);
    assert!((est["recall"].value - 41.0 / 51.0).abs() < 1e-9);
    assert!(est["f1"].value > 0.0);
    assert_eq!(est["precision"].n, 2);
}

#[test]
fn la_segmentacion_y_la_regresion_salen_por_su_media() {
    let m = csv(
        "sample,subject,iou,dice,abs_error\n\
         a.png,PAC-1,0.6,0.7,2\n\
         b.png,PAC-2,0.8,0.9,4\n",
    );
    let est = estimaciones(&m);
    assert!((est["meanIoU"].value - 0.7).abs() < 1e-9);
    assert!((est["dice"].value - 0.8).abs() < 1e-9);
    assert!((est["mae"].value - 3.0).abs() < 1e-9);
    assert!(!est.contains_key("accuracy"));
}

#[test]
fn con_una_sola_muestra_hay_valor_pero_no_intervalo() {
    // Un intervalo sobre una muestra sería decorado.
    let est = estimaciones(&csv("sample,subject,correct\na.png,PAC-1,1\n"));
    let a = &est["accuracy"];
    assert_eq!(a.value, 1.0);
    assert_eq!(a.ci_low, None);
    assert_eq!(a.ci_high, None);
}

#[test]
fn el_intervalo_es_el_mismo_dos_veces() {
    // La semilla es fija: un contrato tiene que poder compararse consigo mismo.
    let filas: String = (0..30)
        .map(|i| format!("m{i}.png,PAC-{i},{}\n", u8::from(i % 3 != 0)))
        .collect();
    let m = csv(&format!("sample,subject,correct\n{filas}"));
    assert_eq!(estimaciones(&m), estimaciones(&m));
}

#[test]
fn un_archivo_que_no_existe_no_es_un_error() {
    // No todos los backends lo escriben todavía.
    assert!(leer(std::path::Path::new("/tmp/annotix-no-existe-jamas")).is_none());
}

#[test]
fn el_sujeto_lo_pone_el_corpus_y_no_el_script() {
    // El script recibe carpetas de imágenes y no sabe de pacientes. Sin este
    // cruce, el remuestreo trataría doce imágenes de un paciente como doce
    // observaciones independientes.
    use crate::store::project_file::ProjectFile;
    let mut pf: ProjectFile = serde_json::from_value(serde_json::json!({
        "version": 11, "id": "p", "name": "p", "type": "bbox", "classes": [],
        "created": 0.0, "updated": 0.0
    }))
    .unwrap();
    for (nombre, sujeto) in [("a.png", "PAC-1"), ("b.png", "PAC-1"), ("c.png", "")] {
        pf.images.push(serde_json::from_value(serde_json::json!({
            "id": nombre, "name": nombre, "file": nombre, "width": 1, "height": 1,
            "uploaded": 0.0, "annotated": null, "status": "annotated",
            "subjectId": sujeto
        }))
        .unwrap());
    }

    let m = con_sujetos(
        parsear("sample,correct\na.png,1\nb.png,0\nc.png,1\nd.png,1\n"),
        &pf,
    );
    assert_eq!(m[0].subject.as_deref(), Some("PAC-1"));
    assert_eq!(m[1].subject.as_deref(), Some("PAC-1"));
    // Sin sujeto declarado, y una muestra que no está en el corpus: ni se
    // inventa ni se mezcla con las demás.
    assert_eq!(m[2].subject, None);
    assert_eq!(m[3].subject, None);

    // Dos imágenes del mismo paciente son un solo grupo.
    assert_eq!(estimaciones(&m)["accuracy"].groups, 3);
}

#[test]
fn el_pck_no_se_confunde_con_un_acierto() {
    // Una pose con la mitad de los puntos bien no es media persona detectada:
    // si el PCK entrara como `correct`, la exactitud del modelo saldría de
    // promediar proporciones.
    let m = csv("sample,subject,pck,abs_error\na.png#0,PAC-1,0.5,0.08\na.png#1,PAC-1,1.0,0.01\n");
    let est = estimaciones(&m);
    assert!((est["pck"].value - 0.75).abs() < 1e-9);
    assert!(!est.contains_key("accuracy"));
    assert!((est["mae"].value - 0.045).abs() < 1e-9);
    // Las dos instancias son del mismo paciente: un solo grupo.
    assert_eq!(est["pck"].groups, 1);
}
