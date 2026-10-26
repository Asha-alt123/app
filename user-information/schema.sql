-- Run this once on your RDS MySQL instance (the app also creates the table automatically).
CREATE DATABASE IF NOT EXISTS userinfo;
USE userinfo;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_email (email)
);
