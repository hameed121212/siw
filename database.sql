-- Create Users Table (Admin and DDOs)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'ddo')),
    ddo_code VARCHAR(50) UNIQUE DEFAULT NULL
);

-- Create Training Centers Table
CREATE TABLE training_centers (
    id SERIAL PRIMARY KEY,
    ddo_code VARCHAR(50) UNIQUE NOT NULL,
    center_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('Functional', 'Non-Functional')),
    type VARCHAR(50) NOT NULL CHECK (type IN ('Government', 'Private')),
    ddo_name VARCHAR(255) NOT NULL,
    extra_fields JSONB DEFAULT '{}'::jsonb
);

-- Create Trainees Table
CREATE TABLE trainees (
    id SERIAL PRIMARY KEY,
    trainee_id VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    cnic VARCHAR(20) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    ddo_code VARCHAR(50) REFERENCES training_centers(ddo_code) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Documents Table
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    direction VARCHAR(50) NOT NULL CHECK (direction IN ('directorate-to-center', 'center-to-directorate')),
    sender_ddo_code VARCHAR(50) DEFAULT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert Default Global Admin (Password: admin123)
-- In production, update this hash using a secure engine
INSERT INTO users (username, password, role) 
VALUES ('admin', '$2a$10$Y5Mls2qYvIe.xRswSg1WcuB69M4Z4gD1C6lC72LgX2j7xWq90XU2G', 'admin');
