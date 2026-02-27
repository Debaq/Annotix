use super::models::{VideoKeyframeRecord, VideoTrackRecord};
use super::Database;

impl Database {
    pub fn create_track(
        &self,
        video_id: i64,
        track_uuid: &str,
        class_id: i64,
        label: Option<&str>,
    ) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO video_tracks (video_id, track_uuid, class_id, label, enabled)
             VALUES (?1, ?2, ?3, ?4, 1)",
            rusqlite::params![video_id, track_uuid, class_id, label],
        )
        .map_err(|e| format!("Error creando track: {}", e))?;

        Ok(conn.last_insert_rowid())
    }

    pub fn list_tracks_by_video(&self, video_id: i64) -> Result<Vec<VideoTrackRecord>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let mut track_stmt = conn
            .prepare(
                "SELECT id, video_id, track_uuid, class_id, label, enabled
                 FROM video_tracks WHERE video_id = ?1 ORDER BY id ASC",
            )
            .map_err(|e| e.to_string())?;

        let tracks: Vec<VideoTrackRecord> = track_stmt
            .query_map(rusqlite::params![video_id], |row| {
                let id: i64 = row.get(0)?;
                let enabled_int: i32 = row.get(5)?;
                Ok(VideoTrackRecord {
                    id: Some(id),
                    video_id: row.get(1)?,
                    track_uuid: row.get(2)?,
                    class_id: row.get(3)?,
                    label: row.get(4)?,
                    enabled: enabled_int != 0,
                    keyframes: Vec::new(),
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        // Load keyframes for each track
        let mut kf_stmt = conn
            .prepare(
                "SELECT id, track_id, frame_index, bbox_x, bbox_y, bbox_width, bbox_height,
                 is_keyframe, enabled
                 FROM video_keyframes WHERE track_id = ?1 ORDER BY frame_index ASC",
            )
            .map_err(|e| e.to_string())?;

        let mut result = Vec::with_capacity(tracks.len());
        for mut track in tracks {
            let track_id = track.id.unwrap();
            let keyframes: Vec<VideoKeyframeRecord> = kf_stmt
                .query_map(rusqlite::params![track_id], |row| {
                    let is_kf: i32 = row.get(7)?;
                    let enabled: i32 = row.get(8)?;
                    Ok(VideoKeyframeRecord {
                        id: Some(row.get(0)?),
                        track_id: row.get(1)?,
                        frame_index: row.get(2)?,
                        bbox_x: row.get(3)?,
                        bbox_y: row.get(4)?,
                        bbox_width: row.get(5)?,
                        bbox_height: row.get(6)?,
                        is_keyframe: is_kf != 0,
                        enabled: enabled != 0,
                    })
                })
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();

            track.keyframes = keyframes;
            result.push(track);
        }

        Ok(result)
    }

    pub fn update_track(
        &self,
        track_id: i64,
        class_id: Option<i64>,
        label: Option<&str>,
        enabled: Option<bool>,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        if let Some(cid) = class_id {
            conn.execute(
                "UPDATE video_tracks SET class_id = ?1 WHERE id = ?2",
                rusqlite::params![cid, track_id],
            )
            .map_err(|e| e.to_string())?;
        }
        if let Some(lbl) = label {
            conn.execute(
                "UPDATE video_tracks SET label = ?1 WHERE id = ?2",
                rusqlite::params![lbl, track_id],
            )
            .map_err(|e| e.to_string())?;
        }
        if let Some(en) = enabled {
            conn.execute(
                "UPDATE video_tracks SET enabled = ?1 WHERE id = ?2",
                rusqlite::params![en as i32, track_id],
            )
            .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    pub fn delete_track(&self, track_id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM video_tracks WHERE id = ?1",
            rusqlite::params![track_id],
        )
        .map_err(|e| format!("Error eliminando track: {}", e))?;
        Ok(())
    }

    pub fn set_keyframe(
        &self,
        track_id: i64,
        frame_index: i64,
        bbox_x: f64,
        bbox_y: f64,
        bbox_width: f64,
        bbox_height: f64,
    ) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO video_keyframes (track_id, frame_index, bbox_x, bbox_y, bbox_width, bbox_height, is_keyframe, enabled)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 1)
             ON CONFLICT(track_id, frame_index)
             DO UPDATE SET bbox_x = ?3, bbox_y = ?4, bbox_width = ?5, bbox_height = ?6, is_keyframe = 1",
            rusqlite::params![track_id, frame_index, bbox_x, bbox_y, bbox_width, bbox_height],
        )
        .map_err(|e| format!("Error guardando keyframe: {}", e))?;

        Ok(conn.last_insert_rowid())
    }

    pub fn delete_keyframe(&self, track_id: i64, frame_index: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM video_keyframes WHERE track_id = ?1 AND frame_index = ?2",
            rusqlite::params![track_id, frame_index],
        )
        .map_err(|e| format!("Error eliminando keyframe: {}", e))?;
        Ok(())
    }

    pub fn toggle_keyframe_enabled(
        &self,
        track_id: i64,
        frame_index: i64,
        enabled: bool,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE video_keyframes SET enabled = ?1 WHERE track_id = ?2 AND frame_index = ?3",
            rusqlite::params![enabled as i32, track_id, frame_index],
        )
        .map_err(|e| format!("Error toggling keyframe: {}", e))?;
        Ok(())
    }
}
