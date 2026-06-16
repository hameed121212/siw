const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'siw_balochistan_secure_key_2026';

// Absolute Connection String Configuration 
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// --- RAW HTML TEMPLATE STRINGS TO PREVENT FILE LOOKUP FAILS ON VERCEL ---
const getIndexHTML = (centers) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><title>Small Industries Wing Balochistan</title>
    <style>
        body { font-family: sans-serif; background: #f4f7f5; color: #2d3142; margin: 0; padding: 0; }
        .header { background: #1e4620; color: white; text-align: center; padding: 20px 10px; }
        .wrapper { max-width: 1100px; margin: 30px auto; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; padding: 0 20px; }
        .card { background: white; padding: 25px; border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
        h2 { color: #1e4620; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
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
                    ${centers.map(c => `<option value="${c.id}">${c.name_of_center}</option>`).join('')}
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
                <button type="submit">Submit Enrolment File Form</button>
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

const getAdminHTML = (centers, trainees, documents, users) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Admin Terminal</title>
<style>
    body { font-family: sans-serif; background: #f8fafc; margin: 0; padding: 20px; }
    .nav { background: #1e4620; color: white; padding: 15px; display: flex; justify-content: space-between; align-items: center; border-radius: 4px; }
    .section { background: white; padding: 20px; margin-top: 20px; border-radius: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px; }
    th, td { padding: 10px; border: 1px solid #e2e8f0; text-align: left; }
    th { background: #f1f5f9; color: #1e4620; }
    .doc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
    .input-box { padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-right: 10px; }
    .btn { background: #2d6a4f; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; }
</style>
</head>
<body>
    <div class="nav">
        <h2>Small Industries Wing Balochistan — Control Panel</h2>
        <a href="/auth/logout" style="color: white; border:1px solid white; padding:5px 10px; text-decoration:none; border-radius:4px;">Logout</a>
    </div>

    <div class="section">
        <h3>🏠 Training Centers Directory</h3>
        <form action="/admin/add-column" method="POST" style="margin-bottom:15px;">
            <input type="text" name="columnName" class="input-box" placeholder="New Column Name" required>
            <button type="submit" class="btn">+ Add Extra Column</button>
        </form>
        <table>
            <thead>
                <tr>
                    <th>S.No</th><th>DDO Code</th><th>Name of Center</th><th>Status</th><th>Type</th><th>DDO Name</th>
                    ${centers.length > 0 && centers[0].dynamic_columns ? Object.keys(centers[0].dynamic_columns).map(k => `<th>${k}</th>`).join('') : ''}
                </tr>
            </thead>
            <tbody>
                ${centers.map(c => `
                    <tr>
                        <td>${c.s_no}</td><td><code>${c.ddo_code}</code></td><td><strong>${c.name_of_center}</strong></td>
                        <td>${c.status}</td><td>${c.type}</td><td>${c.ddo_name}</td>
                        ${c.dynamic_columns ? Object.keys(c.dynamic_columns).map(k => `<td>${c.dynamic_columns[k] || '-'}</td>`).join('') : ''}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div class="section">
        <h3>🔐 Create DDO Access Account</h3>
        <form action="/admin/create-ddo" method="POST">
            <input type="text" name="username" class="input-box" placeholder="DDO Username" required>
            <input type="password" name="password" class="input-box" placeholder="DDO Password" required>
            <select name="center_id" class="input-box" required>
                <option value="">Select Center Assignment</option>
                ${centers.map(c => `<option value="${c.id}">${c.name_of_center}</option>`).join('')}
            </select>
            <button type="submit" class="btn">Generate DDO User</button>
        </form>
    </div>

    <div class="section">
        <h3>👥 Enrolled Trainees Master Ledger</h3>
        <table>
            <thead>
                <tr><th>Special ID</th><th>Name</th><th>CNIC</th><th>Course</th><th>District</th><th>Vendor No</th><th>Bank Account</th><th>EasyPaisa</th><th>Status</th></tr>
            </thead>
            <tbody>
                ${trainees.map(t => `
                    <tr>
                        <td><code>${t.trainee_id}</code></td><td>${t.full_name}</td><td>${t.cnic}</td><td>${t.course_name}</td>
                        <td>${t.district || '-'}</td><td>${t.vendor_number || '-'}</td><td>${t.bank_account_number || '-'}</td><td>${t.easypaisa_number || '-'}</td><td>${t.status}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div class="doc-grid">
        <div class="section">
            <h3>📤 Directorate to Training Centers</h3>
            <form action="/admin/upload-document" method="POST" style="margin-bottom:15px;">
                <input type="text" name="title" class="input-box" placeholder="Doc Title" required>
                <input type="text" name="file_url" class="input-box" placeholder="File URL" required>
                <button type="submit" class="btn">Transmit</button>
            </form>
            <ul>
                ${documents.filter(d => d.direction === 'Directorate-to-Center').map(d => `<li><a href="${d.file_url}" target="_blank">${d.title}</a></li>`).join('')}
            </ul>
        </div>
        <div class="section">
            <h3>📥 Training Centers to Directorate</h3>
            <ul>
                ${documents.filter(d => d.direction === 'Center-to-Directorate').map(d => `<li><a href="${d.file_url}" target="_blank">${d.title}</a></li>`).join('')}
            </ul>
        </div>
    </div>
</body>
</html>`;

const getDdoHTML = (center, trainees, incomingDocs, outgoingDocs) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>DDO Dashboard</title>
<style>
    body { font-family: sans-serif; background: #f4f9f4; margin: 0; padding: 20px; }
    .nav { background: #2d6a4f; color: white; padding: 15px; display: flex; justify-content: space-between; align-items: center; border-radius: 4px; }
