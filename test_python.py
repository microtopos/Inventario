#!/usr/bin/env python3
"""Test script to verify global units flow using Python's sqlite3"""

import sqlite3
from datetime import datetime

def test_database():
    print("=== Testing Global Units Flow ===\n")

    try:
        # Connect to the database
        conn = sqlite3.connect('src/inventario.db')
        cursor = conn.cursor()
        print(" Checkmark: Database connection successful\n")

        # Test 1: Check tables
        print("1. Checking tables...")
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        print(f"   Found {len(tables)} tables:")
        for table in tables:
            print(f"   - {table[0]}")

        # Test 2: Get units
        print("\n2. Getting units of presentation...")
        cursor.execute("SELECT * FROM unidades_presentacion ORDER BY nombre")
        units = cursor.fetchall()
        print(f"   Found {len(units)} units")
        for u in units:
            print(f"   - {u[1]} (ID: {u[0]})")

        # Test 3: Get departments
        print("\n3. Getting departments...")
        cursor.execute("SELECT * FROM departamentos_prod ORDER BY nombre")
        depts = cursor.fetchall()
        print(f"   Found {len(depts)} departments")
        for d in depts:
            print(f"   - {d[1]} (ID: {d[0]})")

        # Test 4: Get products
        print("\n4. Getting products...")
        cursor.execute("SELECT id, referencia, nombre, unidad_medida, precio FROM productos_almacen WHERE activo = 1 ORDER BY referencia LIMIT 5")
        products = cursor.fetchall()
        print(f"   Found {len(products)} active products (showing first 5)")
        for p in products:
            print(f"   - {p[1]}: {p[2]}")

        # Test 5: Insert a test unit if none exists
        print("\n5. Testing unit insertion...")
        if len(units) == 0:
            cursor.execute("INSERT INTO unidades_presentacion (nombre) VALUES (?)", ('Test Unit',))
            unit_id = cursor.lastrowid
            conn.commit()
            print(f"   Inserted test unit with ID: {unit_id}")
        else:
            print("   Skipping - units already exist")

        # Test 6: Test product upsert
        print("\n6. Testing product upsert...")
        import time
        test_ref = f'TEST-{int(time.time())}'
        cursor.execute(
            "INSERT OR REPLACE INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, precio, activo)"
            " VALUES (?, ?, ?, ?, ?, 1)",
            (test_ref, 'Test Product', 1, 'UNIDAD', 100.00)
        )
        conn.commit()
        print(f"   Upserted product {test_ref}")

        # Get the product ID
        cursor.execute("SELECT id FROM productos_almacen WHERE referencia = ?", (test_ref,))
        product_id = cursor.fetchone()[0]

        # Test 7: Test salida insertion
        print("\n7. Testing salida insertion...")
        now = datetime.now()
        cursor.execute(
            "INSERT INTO salidas_productos (producto_id, departamento_id, presentacion_id, cantidad, mes, anio)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (product_id, 1, None, 50, now.month, now.year)
        )
        changes = cursor.rowcount
        conn.commit()
        print(f"   Inserted salida with changes: {changes}")

        # Test 8: Verify salidas
        print("\n8. Verifying salidas...")
        cursor.execute("SELECT * FROM salidas_productos WHERE producto_id = ? ORDER BY anio DESC, mes DESC LIMIT 5", (product_id,))
        salidas = cursor.fetchall()
        print(f"   Found {len(salidas)} salidas for product {product_id}")
        for s in salidas:
            print(f"   - Product: {s[1]}, Dept: {s[2]}, Mes: {s[4]}, Anio: {s[5]}, Cantidad: {s[3]}")

        # Test 9: Test getSalidasByYear query
        print("\n9. Testing getSalidasByYear query...")
        cursor.execute("""
            SELECT
                s.producto_id,
                s.departamento_id,
                s.cantidad,
                s.mes,
                s.anio,
                p.referencia,
                p.nombre
            FROM salidas_productos s
            JOIN productos_almacen p ON p.id = s.producto_id
            WHERE s.anio = ?
            ORDER BY s.producto_id, s.mes
        """, (now.year,))
        salidas_by_year = cursor.fetchall()
        print(f"   Found {len(salidas_by_year)} salidas for year {now.year}")

        # Test 10: Test upsertSalida with specific presentation
        print("\n10. Testing upsertSalida with presentation...")
        # Get or create a unit
        cursor.execute("SELECT id FROM unidades_presentacion LIMIT 1")
        unit_result = cursor.fetchone()
        if unit_result:
            unit_id = unit_result[0]
            # Get or create a presentation for product
            cursor.execute("SELECT id FROM producto_presentaciones WHERE producto_id = ? AND unidad_id = ? LIMIT 1", (product_id, unit_id))
            pres_result = cursor.fetchone()
            pres_id = pres_result[0] if pres_result else None

            if not pres_id:
                cursor.execute(
                    "INSERT INTO producto_presentaciones (producto_id, unidad_id, precio) VALUES (?, ?, ?)",
                    (product_id, unit_id, 150.00)
                )
                conn.commit()
                pres_id = cursor.lastrowid
                print(f"   Created presentation with ID: {pres_id}")

            # Now upsert with presentation
            cursor.execute(
                "INSERT OR REPLACE INTO salidas_productos (producto_id, departamento_id, presentacion_id, cantidad, mes, anio)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (product_id, 1, pres_id, 25, now.month, now.year)
            )
            conn.commit()
            changes = cursor.rowcount
            print(f"   Upserted salida with presentation (changes: {changes})")
        else:
            print("   Skipping - no units found")

        conn.close()
        print("\n=== All Database Tests Completed ===")

    except Exception as e:
        print(f"\n X Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_database()