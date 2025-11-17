<?php
// Database configuration
// Update these values with your MySQL credentials
define('DB_HOST', 'localhost');
define('DB_NAME', 'dashboard');
define('DB_USER', 'dashboard_user');  // Change this to your MySQL username
define('DB_PASS', 'dashboard_pass');  // Change this to your MySQL password

function getDB() {
    static $db = null;

    if ($db === null) {
        try {
            $db = new PDO(
                'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
                DB_USER,
                DB_PASS
            );
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            throw new Exception('Database connection failed: ' . $e->getMessage());
        }
    }

    return $db;
}
