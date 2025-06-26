import psycopg2

DB_URL = "postgresql://myuser:1999@localhost:5432/one_project_db_milestone"

def assign_positions(project_id: int, view_id: int):
    query = """
    WITH grouped AS (
        SELECT 
            emsr_no,
            beschreibung,
            einbauort,
            medium,
            ROW_NUMBER() OVER (
                ORDER BY emsr_no, beschreibung, einbauort, medium
            ) * 1000 AS position
        FROM project_articles
        WHERE view_id = %s AND project_id = %s
        GROUP BY emsr_no, beschreibung, einbauort, medium
    ),
    updated AS (
        SELECT 
            pa.id,
            g.position
        FROM project_articles pa
        JOIN grouped g USING (emsr_no, beschreibung, einbauort, medium)
        WHERE pa.view_id = %s AND pa.project_id = %s
    )
    UPDATE project_articles pa
    SET position = u.position
    FROM updated u
    WHERE pa.id = u.id;
    """
    conn = psycopg2.connect(DB_URL)
    cursor = conn.cursor()
    cursor.execute(query, (view_id, project_id, view_id, project_id))
    conn.commit()
    print(f"✅ Position values assigned for project {project_id}, view {view_id}")
    cursor.close()
    conn.close()

if __name__ == "__main__":
    assign_positions(project_id=1, view_id=5)
