#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE DATABASE db_agustin_auth;
	CREATE DATABASE db_agustin_inventory;
	CREATE DATABASE db_agustin_sales;
	CREATE DATABASE face_db;
EOSQL
