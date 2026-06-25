-- Initialize multiple databases for the microservices
SELECT 'CREATE DATABASE db_agustin_auth' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'db_agustin_auth')\gexec
SELECT 'CREATE DATABASE db_agustin_inventory' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'db_agustin_inventory')\gexec
SELECT 'CREATE DATABASE db_agustin_sales' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'db_agustin_sales')\gexec
SELECT 'CREATE DATABASE face_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'face_db')\gexec
