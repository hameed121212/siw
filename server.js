const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'siw_balochistan_secure_key_2026';

// Initialize Database Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// --- RAW HTML LAYOUTS (Embedded to bypass path resolution errors) ---
const getIndexHTML = (centers, dbError = null) => {
  // Ensure centers is always handled as a valid array to prevent .map() crashes
  const safeCenters = Array.isArray(centers) ? centers : [];
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Small Industries Wing Balochistan</title>
    <style>
        body { font-family: sans-serif; background: #f4f7f5; color: #2d3142; margin: 0; padding: 0; }
        .header { background: #1e4620; color: white; text-align: center; padding: 20px 10px; }
        .wrapper { max-width: 1100px; margin: 30px auto; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; padding: 0 20px; }
        .card { background: white; padding: 25px; border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
        .alert-error { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 4px; margin: 20px auto; max-width: 1060px; border: 1px solid #f5c6cb; text-align: center; }
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

    ${dbError ? `<div class="alert-error"><strong>Database Connection Notice:</strong> ${dbError}<br><small>Please verify your Vercel DATABASE_URL Environment Variable string configuration.</small></div>` : ''}

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
                    ${safeCenters.map(c => `<option value="${c.id}">${c.name_of_center || 'Unnamed Center'}</option>`).join('')}
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
};

// --- HOME ROUTE WITH CRASH PROTECTION ---
app.get('/', async (req, res) => {
  try {
    const centersRes = await pool.query('SELECT id, name_of_center FROM training_centers ORDER BY s_no ASC');
    const centerRows = (centersRes && centersRes.rows) ? centersRes.rows : [];
    res.send(getIndexHTML(centerRows));
  } catch (err) {
    console.error("Database fetch crashed on landing screen:", err.message);
    // Graceful fallback display instead of throwing a Vercel 500 error page
    res.send(getIndexHTML([], err.message));
  }
});

// --- PUBLIC SUBMISSION HANDLER ---
app.post('/submit-trainee', async (req, res) => {
  const { full_name, cnic, mobile_number, center_id, course_name, district, tehsil, union_council, vendor_number, bank_account_number, easypaisa_number } = req.body;
  try {
    const year = new Date().getFullYear();
    const countRes = await pool.query("SELECT COUNT(*) FROM trainees WHERE trainee_id LIKE $1", [`SIW-BAL-${year}-%`]);
    const currentCount = (countRes && countRes.rows && countRes.rows[0]) ? parseInt(countRes.rows[0].count || 0) : 0;
    const nextSequence = String(currentCount + 1).padStart(4, '0');
    const specialTraineeId = `SIW-BAL-${year}-${nextSequence}`;

    await pool.query(`
      INSERT INTO trainees (trainee_id, full_name, cnic, mobile_number, center_id, course_name, district, tehsil, union_council, vendor_number, bank_account_number, easypaisa_number) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [specialTraineeId, full_name, cnic, mobile_number, center_id ? parseInt(center_id) : null, course_name, district, tehsil, union_council, vendor_number, bank_account_number, easypaisa_number]
    );
    res.send(`<h2>Submission successful! Your Trainee ID is: <mark>${specialTraineeId}</mark></h2><p><a href="/">Go Back</a></p>`);
  } catch (err) {
    res.status(500).send("Database submission failure: " + err.message);
  }
});

// --- AUTH SYSTEM ---
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (!userResult || !userResult.rows || userResult.rows.length === 0) {
      return res.status(401).send('Invalid credential parameters matching terminal.');
    }
    const user = userResult.rows[0];
    if (user.password_hash !== password) return res.status(401).send('Invalid credential configurations.');

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, center_id: user.center_id }, JWT_SECRET, { expiresIn: '2h' });
    res.cookie('portal_token', token, { httpOnly: true, secure: true });

    if (user.role === 'Admin') return res.redirect('/admin/dashboard');
    if (user.role === 'DDO') return res.redirect('/ddo/dashboard');
  } catch (err) {
    res.status(500).send('Login Error: ' + err.message);
  }
});

const verifyAccess = (role) => {
  return (req, res, next) => {
    const token = req.cookies.portal_token;
    if (!token) return res.status(403).send('Access Denied.');
    try {
      const verified = jwt.verify(token, JWT_SECRET);
      req.user = verified;
      if (role && req.user.role !== role) return res.status(403).send('Unauthorized.');
      next();
    } catch (err) { return res.status(400).send('Session expired.'); }
  };
};

app.get('/auth/logout', (req, res) => {
  res.clearCookie('portal_token');
  res.redirect('/');
});

app.listen(PORT, () => console.log(`Active server cluster monitoring on port ${PORT}`));
module.exports = app;
