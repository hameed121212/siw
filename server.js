const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'siw_balochistan_secure_key_2026';

// Initialize Database Connection Pool with SSL Mode Forced
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// ==========================================
// 1. PUBLIC LANDING PAGE HTML TEMPLATE
// ==========================================
const getIndexHTML = (centers, dbError = null) => {
  const safeCenters = Array.isArray(centers) ? centers : [];
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><title>Small Industries Wing Balochistan</title>
    <style>
        body { font-family: sans-serif; background: #f4f7f5; color: #2d3142; margin: 0; padding: 0; }
        .header { background: #1e4620; color: white; text-align: center; padding: 20px 10px; }
        .wrapper { max-width: 1100px; margin: 30px auto; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; padding: 0 20px; }
        .card { background: white; padding: 25px; border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
        .alert-error { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 4px; margin: 20px auto; max-width: 1060px; border: 1px solid #f5c6cb; text-align: center; }
        h2 { color: #1e4620; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 20px; }
        label { display: block; margin: 12px 0 6px; font-weight: bold; font-size: 14px; }
        input, select { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
        button { background: #2d6a4f; color: white; border: none; padding: 12px; border-radius: 4px; font-weight: bold; width: 100%; margin-top: 15px; cursor: pointer; }
        button:hover { background: #1b4332; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Small Industries Wing Balochistan</h1>
        <p>Government of Balochistan Directorate Portal System</p>
    </div>
    ${dbError ? `<div class="alert-error"><strong>Database Connection Wait Check:</strong> ${dbError}</div>` : ''}
    <div class="wrapper">
        <div class="card">
            <h2>Trainee Registration Desk</h2>
            <form action="/submit-trainee" method="POST">
                <label>Full Name</label><input type="text" name="full_name" placeholder="Enter Full Name" required>
                <label>CNIC Number</label><input type="text" name="cnic" placeholder="Format: 54400-0000000-0" required>
                <label>Mobile Contact Number</label><input type="text" name="mobile_number" placeholder="Enter Mobile Number" required>
                <label>Target Assignment Training Center</label>
                <select name="center_id" required>
                    <option value="">-- Choose Center Selection --</option>
                    ${safeCenters.map(c => `<option value="${c.id}">${c.name_of_center}</option>`).join('')}
                </select>
                <label>Course Program</label><input type="text" name="course_name" placeholder="e.g. Computer Application" required>
                
                <h2>🌍 Geographical Information</h2>
                <label>District</label><input type="text" name="district" placeholder="e.g. Quetta" required>
                <label>Tehsil</label><input type="text" name="tehsil" required>
                <label>Union Council (UC)</label><input type="text" name="union_council">

                <h2>💰 Financial Information</h2>
                <label>Vendor Number</label><input type="text" name="vendor_number" placeholder="Enter Govt Vendor Code">
                <label>Bank Account Number (IBAN)</label><input type="text" name="bank_account_number" placeholder="PK00BANK...">
                <label>EasyPaisa Mobile Wallet Number</label><input type="text" name="easypaisa_number" placeholder="03XXXXXXXXX">
                <button type="submit">Submit Enrolment Form</button>
            </form>
        </div>
        <div class="card">
            <h2>Secure Management Terminal Access</h2>
            <form action="/auth/login" method="POST">
                <label>Username / Account ID Token</label><input type="text" name="username" required>
                <label>Security Password String</label><input type="password" name="password" required>
                <button type="submit" style="background: #d4a373;">Authenticate Portal Link</button>
            </form>
        </div>
    </div>
</body>
</html>`;
};

// ==========================================
// 2. ADMIN COMMAND DASHBOARD HTML TEMPLATE
// ==========================================
const getAdminHTML = (centers, trainees, documents) => {
  const safeCenters = Array.isArray(centers) ? centers : [];
  const safeTrainees = Array.isArray(trainees) ? trainees : [];
  const safeDocs = Array.isArray(documents) ? documents : [];
  
  // Extract dynamic columns list safely from first item if it exists
  const dynamicCols = (safeCenters.length > 0 && safeCenters[0].dynamic_columns) ? Object.keys(safeCenters[0].dynamic_columns) : [];
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><title>Admin Control Terminal</title>
    <style>
        body { font-family: sans-serif; background: #f8fafc; margin: 0; padding: 20px; color: #334155; }
        .nav { background: #1e4620; color: white; padding: 15px 25px; display: flex; justify-content: space-between; align-items: center; border-radius: 6px; }
        .section { background: white; padding: 25px; margin-top: 25px; border-radius: 6px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
        h3 { color: #1e4620; margin-top: 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
        th, td { padding: 12px; border: 1px solid #cbd5e1; text-align: left; }
        th { background: #f1f5f9; color: #1e4620; font-weight: bold; }
        .btn { background: #2d6a4f; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; font-weight: bold; }
        .btn:hover { background: #1b4332; }
        .input-box { padding: 10px; border: 1px solid #cbd5e1; border-radius: 4px; margin-right: 10px; min-width: 200px; }
        .doc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; }
        code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="nav">
        <h2>Small Industries Wing Balochistan — Master Control Panel</h2>
        <a href="/auth/logout" style="color: white; border:1px solid white; padding:8px 15px; text-decoration:none; border-radius:4px; font-weight:bold;">Logout</a>
    </div>

    <div class="section">
        <h3>🏠 Training Centers Directory</h3>
        <form action="/admin/add-column" method="POST" style="margin-bottom:20px;">
            <input type="text" name="columnName" class="input-box" placeholder="Enter New Column Label" required>
            <button type="submit" class="btn">+ Add Extra Column</button>
        </form>
        <table>
            <thead>
                <tr>
                    <th>S.No</th><th>DDO Code</th><th>Name of Center</th><th>Status</th><th>Type</th><th>DDO Name</th>
                    ${dynamicCols.map(col => `<th>${col.replace(/_/g, ' ')}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${safeCenters.map(c => `
                    <tr>
                        <td>${c.s_no || '-'}</td>
                        <td><code>${c.ddo_code || '-'}</code></td>
                        <td><strong>${c.name_of_center || '-'}</strong></td>
                        <td>${c.status || '-'}</td>
                        <td>${c.type || '-'}</td>
                        <td>${c.ddo_name || 'Unassigned'}</td>
                        ${dynamicCols.map(col => `<td>${(c.dynamic_columns && c.dynamic_columns[col]) ? c.dynamic_columns[col] : '-'}</td>`).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div class="section">
        <h3>🔐 Generate DDO User Workspace Access</h3>
        <form action="/admin/create-ddo" method="POST">
            <input type="text" name="username" class="input-box" placeholder="Assign Username" required>
            <input type="password" name="password" class="input-box" placeholder="Assign Secure Password" required>
            <select name="center_id" class="input-box" required>
                <option value="">Select Center Scope Binding</option>
                ${safeCenters.map(c => `<option value="${c.id}">${c.name_of_center}</option>`).join('')}
            </select>
            <button type="submit" class="btn">Create User Account</button>
        </form>
    </div>

    <div class="section">
        <h3>👥 Registered Trainees Ledger Profile</h3>
        <table>
            <thead>
                <tr>
                    <th>Trainee ID</th><th>Name</th><th>CNIC</th><th>Course</th>
                    <th>Geographic Core</th><th>Financial Indicators</th><th>State</th>
                </tr>
            </thead>
            <tbody>
                ${safeTrainees.map(t => `
                    <tr>
                        <td><code>${t.trainee_id || '-'}</code></td>
                        <td><strong>${t.full_name || '-'}</strong></td>
                        <td>${t.cnic || '-'}</td>
                        <td>${t.course_name || '-'}</td>
                        <td>Dist: ${t.district || '-'}<br>Tehsil: ${t.tehsil || '-'}</td>
