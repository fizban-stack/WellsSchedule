-- Add chore_values table to the dashboard database

CREATE TABLE IF NOT EXISTS chore_values (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chore_name VARCHAR(255) NOT NULL UNIQUE,
    dollar_value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX idx_chore_name ON chore_values(chore_name);
