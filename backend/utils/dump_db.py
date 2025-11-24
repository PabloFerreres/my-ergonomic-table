import psycopg2
import json
import os
import sys

def dump_full_db(output_path: str):
    # Import DB_URL here to avoid import errors when running as script
    from backend.settings.connection_points import DB_URL
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        """)
        tables = [r[0] for r in cur.fetchall()]
        db_dump = {}
        for table in tables:
            cur.execute(f'SELECT * FROM "{table}"')
            rows = cur.fetchall()
            colnames = [desc[0] for desc in cur.description] if cur.description else []
            db_dump[table] = [dict(zip(colnames, row)) for row in rows] if colnames else []
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(db_dump, f, ensure_ascii=False, indent=2)
        print(f"DB dump saved to {output_path}")
    finally:
        cur.close()
        conn.close()

def write_dbdiagram_style_with_fks(output_path: str):
    from backend.settings.connection_points import DB_URL
    type_map = {
        'integer': 'int4',
        'serial': 'serial4',
        'bigint': 'int8',
        'smallint': 'int2',
        'character varying': 'varchar',
        'varchar': 'varchar',
        'text': 'text',
        'boolean': 'bool',
        'jsonb': 'jsonb',
        'timestamp with time zone': 'timestamptz',
        'timestamp without time zone': 'timestamp',
        'real': 'float4',
        'double precision': 'float8',
        'uuid': 'uuid',
        'numeric': 'numeric',
        # fallback
    }
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        """)
        tables = [r[0] for r in cur.fetchall()]
        table_columns = {}
        for table in tables:
            cur.execute(f'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = %s', (table,))
            columns = cur.fetchall()
            table_columns[table] = columns
        with open(output_path, 'w', encoding='utf-8') as f:
            # Write tables
            for table, columns in table_columns.items():
                f.write(f'Table "{table}" {{\n')
                for col_name, data_type in columns:
                    db_type = type_map.get(data_type, data_type)
                    f.write(f'  "{col_name}" {db_type}\n')
                f.write('}\n\n')
            # Write FKs
            for table, columns in table_columns.items():
                for col_name, data_type in columns:
                    if col_name.endswith('_id') and col_name != 'id':
                        ref_table = col_name[:-3]
                        # pluralize if not already plural
                        if not ref_table.endswith('s'):
                            ref_table += 's'
                        # Only add FK if referenced table exists
                        if ref_table in table_columns:
                            f.write(f'Ref "{table}_{col_name}_fkey":"{ref_table}"."id" < "{table}"."{col_name}"\n')
        print(f"DB diagram structure with FKs saved to {output_path}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    debug = False  # Set to True to enable writing dbdiagram.txt
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
    output_path = os.path.join(os.path.dirname(__file__), "dbdiagram.txt")
    if debug:
        write_dbdiagram_style_with_fks(output_path)
