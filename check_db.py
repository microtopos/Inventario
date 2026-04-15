#!/usr/bin/env python3
"""Check the database structure"""

import sqlite3

def check_database():
    try:
        # Connect to the database
        conn = sqlite3.connect('src/inventario.db')
        cursor = conn.cursor()
        print(" Checkmark: Database connection successful\n")

        # List all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        tables = cursor.fetchall()
        print(f"Tables in database ({len(tables)} total):")
        for table in tables:
            print(f"  - {table[0]}")

        # Check for the units_presentacion table
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='unidades_presentacion'")
        if cursor.fetchone():
            print("\n✓ unidades_presentacion table exists")
            cursor.execute("SELECT * FROM unidades_presentacion")
            units = cursor.fetchall()
            print(f"  Found {len(units)} units:")
            for u in units:
                print(f"    {u}")
        else:
            print("\n✗ unidades_presentacion table does NOT exist")

        # Check for producto_presentaciones table
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='producto_presentaciones'")
        if cursor.fetchone():
            print("\n✓ producto_presentaciones table exists")
            cursor.execute("SELECT COUNT(*) FROM producto_presentaciones")
            count = cursor.fetchone()[0]
            print(f"  Found {count} product presentations")
        else:
            print("\n✗ producto_presentaciones table does NOT exist")

        # Check for salidas_productos table
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='salidas_productos'")
        if cursor.fetchone():
            print("\n✓ salidas_productos table exists")
            cursor.execute("SELECT COUNT(*) FROM salidas_productos")
            count = cursor.fetchone()[0]
            print(f"  Found {count} salida records")
        else:
            print("\n✗ salidas_productos table does NOT exist")

        conn.close()
        print("\n=== Database Check Complete ===")

    except Exception as e:
        print(f" X Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    check_database()