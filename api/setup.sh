#!/bin/bash

echo "==================================="
echo "Dashboard Database Setup"
echo "==================================="
echo ""
echo "This script will create the database, user, and tables."
echo ""

# Get MySQL root password
read -sp "Enter MySQL root password (press Enter if no password): " MYSQL_ROOT_PASS
echo ""

# Test MySQL connection
if [ -z "$MYSQL_ROOT_PASS" ]; then
    MYSQL_CMD="mysql -u root"
else
    MYSQL_CMD="mysql -u root -p$MYSQL_ROOT_PASS"
fi

# Test connection
echo "Testing MySQL connection..."
if ! $MYSQL_CMD -e "SELECT 1" > /dev/null 2>&1; then
    echo "Error: Cannot connect to MySQL. Please check your root password."
    exit 1
fi

echo "Connection successful!"
echo ""

# Create database and user
echo "Creating database and user..."
$MYSQL_CMD <<EOF
CREATE DATABASE IF NOT EXISTS dashboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'dashboard_user'@'localhost' IDENTIFIED BY 'dashboard_pass';
GRANT ALL PRIVILEGES ON dashboard.* TO 'dashboard_user'@'localhost';
FLUSH PRIVILEGES;
EOF

echo "Database and user created!"
echo ""

# Create tables
echo "Creating tables..."
$MYSQL_CMD dashboard <<EOF
CREATE TABLE IF NOT EXISTS calendar_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entry_date DATE NOT NULL,
    title VARCHAR(255) NOT NULL,
    time VARCHAR(10) NOT NULL,
    description TEXT,
    assigned_to VARCHAR(50),
    recurring TINYINT(1) DEFAULT 0,
    recur_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entry_date (entry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chore_date DATE NOT NULL,
    text VARCHAR(255) NOT NULL,
    assigned_to VARCHAR(50),
    completed TINYINT(1) DEFAULT 0,
    recurring TINYINT(1) DEFAULT 0,
    recur_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_chore_date (chore_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recurring_entries (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    time VARCHAR(10) NOT NULL,
    description TEXT,
    assigned_to VARCHAR(50),
    start_date DATE NOT NULL,
    end_date DATE,
    frequency ENUM('daily', 'weekly', 'monthly') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recurring_chores (
    id VARCHAR(50) PRIMARY KEY,
    text VARCHAR(255) NOT NULL,
    assigned_to VARCHAR(50),
    start_date DATE NOT NULL,
    end_date DATE,
    frequency ENUM('daily', 'weekly', 'monthly') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monthly_completions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    month VARCHAR(7) NOT NULL,
    family_member VARCHAR(50) NOT NULL,
    count INT DEFAULT 0,
    UNIQUE KEY unique_month_member (month, family_member)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gcal_config (
    id INT PRIMARY KEY DEFAULT 1,
    api_key TEXT,
    calendar_id VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chore_values (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chore_name VARCHAR(255) NOT NULL UNIQUE,
    dollar_value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX idx_chore_name ON chore_values(chore_name);
EOF

echo ""
echo "==================================="
echo "Setup Complete!"
echo "==================================="
echo ""
echo "Database: dashboard"
echo "User: dashboard_user"
echo "Password: dashboard_pass"
echo ""
echo "All tables have been created successfully."
echo ""
