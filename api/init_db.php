<?php
// Initialize MySQL database for the dashboard

try {
    // First connect without database to create it
    $db = new PDO(
        'mysql:host=localhost;charset=utf8mb4',
        'root',
        ''
    );
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Create database if it doesn't exist
    $db->exec("CREATE DATABASE IF NOT EXISTS dashboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    echo "Database 'dashboard' created or already exists\n";

    // Connect to the database
    $db->exec("USE dashboard");

    // Create calendar_entries table
    $db->exec("CREATE TABLE IF NOT EXISTS calendar_entries (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    echo "Table 'calendar_entries' created\n";

    // Create chores table
    $db->exec("CREATE TABLE IF NOT EXISTS chores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chore_date DATE NOT NULL,
        text VARCHAR(255) NOT NULL,
        assigned_to VARCHAR(50),
        completed TINYINT(1) DEFAULT 0,
        recurring TINYINT(1) DEFAULT 0,
        recur_id VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_chore_date (chore_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    echo "Table 'chores' created\n";

    // Create recurring_entries table
    $db->exec("CREATE TABLE IF NOT EXISTS recurring_entries (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        time VARCHAR(10) NOT NULL,
        description TEXT,
        assigned_to VARCHAR(50),
        start_date DATE NOT NULL,
        end_date DATE,
        frequency ENUM('daily', 'weekly', 'monthly') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    echo "Table 'recurring_entries' created\n";

    // Create recurring_chores table
    $db->exec("CREATE TABLE IF NOT EXISTS recurring_chores (
        id VARCHAR(50) PRIMARY KEY,
        text VARCHAR(255) NOT NULL,
        assigned_to VARCHAR(50),
        start_date DATE NOT NULL,
        end_date DATE,
        frequency ENUM('daily', 'weekly', 'monthly') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    echo "Table 'recurring_chores' created\n";

    // Create monthly_completions table
    $db->exec("CREATE TABLE IF NOT EXISTS monthly_completions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        month VARCHAR(7) NOT NULL,
        family_member VARCHAR(50) NOT NULL,
        count INT DEFAULT 0,
        UNIQUE KEY unique_month_member (month, family_member)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    echo "Table 'monthly_completions' created\n";

    // Create gcal_config table
    $db->exec("CREATE TABLE IF NOT EXISTS gcal_config (
        id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        api_key TEXT,
        calendar_id VARCHAR(255),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    echo "Table 'gcal_config' created\n";

    echo "\nDatabase initialized successfully!\n";

} catch (PDOException $e) {
    die("Database initialization failed: " . $e->getMessage() . "\n");
}
?>
