-- Drop existing tables to ensure a clean structural setup
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS trainees CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS training_centers CASCADE;

-- 1. Training Centers Setup
CREATE TABLE training_centers (
    id SERIAL PRIMARY KEY,
    s_no INT,
    ddo_code VARCHAR(50) UNIQUE NOT NULL,
    name_of_center VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'Functional' CHECK (status IN ('Functional', 'Non-Functional')),
    type VARCHAR(50) DEFAULT 'Govt' CHECK (type IN ('Govt', 'Private')),
    ddo_name VARCHAR(155),
    dynamic_columns JSONB DEFAULT '{}'::jsonb
);

-- 2. Security & User Credentials
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('Admin', 'DDO')) NOT NULL,
    center_id INT REFERENCES training_centers(id) ON DELETE SET NULL
);

-- 3. Trainee Admissions Tracking Matrix
CREATE TABLE trainees (
    id SERIAL PRIMARY KEY,
    trainee_id VARCHAR(50) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    cnic VARCHAR(15) UNIQUE NOT NULL,
    mobile_number VARCHAR(20),
    center_id INT REFERENCES training_centers(id),
    course_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    district VARCHAR(100) NOT NULL,
    tehsil VARCHAR(100) NOT NULL,
    union_council VARCHAR(100),
    vendor_number VARCHAR(100),
    bank_account_number VARCHAR(100),
    easypaisa_number VARCHAR(20),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Shared Communications Document Vault
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    direction VARCHAR(50) CHECK (direction IN ('Directorate-to-Center', 'Center-to-Directorate')) NOT NULL,
    uploaded_by INT REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SEED DATA: Insert default centers, trainees, and structural accounts for real-time testing
INSERT INTO training_centers (s_no, ddo_code, name_of_center, status, type, ddo_name) VALUES
(1, 'DDO-QTA-01', 'Quetta Technical Training Center', 'Functional', 'Govt', 'Muhammad Ali'),
(2, 'DDO-MST-02', 'Mastung Handicraft Development Center', 'Functional', 'Govt', 'Abdul Ghaffar');

-- Password for both accounts is typed plainly as 'admin123' and 'ddo123' for verification
INSERT INTO users (username, password_hash, role, center_id) VALUES
('admin', 'admin123', 'Admin', NULL),
('ddoqta', 'ddo123', 'DDO', 1);
