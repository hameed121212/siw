const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'siw_balochistan_secret_key_2026';

// Neon Postgres Database Connection Pool Setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Configure Path Resolution and Engine for Vercel Serverless environment
app.set('views', path.join(__dirname, 'public', 'views'));
app.set('view engine', 'ejs');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// SECURITY MIDDLEWARE: Verifies roles and checks specific access permissions
const verifyAccess = (role) => {
  return (req, res, next) => {
    const token = req.cookies.portal_token;
    if (!token) return res.status(403).send('Access Denied: Please log in via the Terminal Panel.');
    try {
      const verified = jwt.verify(token, JWT_SECRET);
      req.user = verified;
      if (role && req.user.role !== role) {
        return res.status(403).send('Access Denied: Insufficient authorization clearing level.');
      }
      next();
    } catch (err) {
      res.clearCookie('portal_token');
      return res.status(401).send('Session expired or invalid token. Please log in again.');
    }
  };
};

// --- PUBLIC ROUTES ---

// Render main login page and public registration forms
app.get('/', async (req, res) => {
  try {
    const centersRes = await pool.query('SELECT * FROM training_centers WHERE status = \'Functional\' ORDER BY s_no ASC');
    res.render('index', { centers: centersRes.rows });
  } catch (err) {
    res.status(500).send('System boot error matching database endpoints.');
  }
});

// Submit Enrolment Form Route
app.post('/submit-trainee', async (req, res) => {
  const { 
    full_name, cnic, mobile_number, center_id, course_name,
    district, tehsil, union_council, vendor_number, bank_account_number, easypaisa_number 
  } = req.body;

  try {
    const year = new Date().getFullYear();
    const countRes = await pool.query('SELECT COUNT(*) FROM trainees WHERE trainee_id LIKE $1', [`SIW-BAL-${year}-%`]);
    const nextSequence = String(parseInt(countRes.rows[0].count || 0) + 1).padStart(4, '0');
    const uniqueTraineeId = `SIW-BAL-${year}-${nextSequence}`;

    const insertQuery = `
      INSERT INTO trainees (
        trainee_id, full_name, cnic, mobile_number, center_id, course_name, 
        district, tehsil, union_council, vendor_number, bank_account_number, easypaisa_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;

    await pool.query(insertQuery, [
      uniqueTraineeId, full_name, cnic, mobile_number, center_id, course_name,
      district, tehsil, union_council, vendor_number, bank_account_number, easypaisa_number
    ]);

    res.send(`<h3>Submission successful! Registered Trainee Identification ID: <span style="color:green;">${uniqueTraineeId}</span></h3><a href="/">Go Back</a>`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Database execution processing error.');
  }
});

// Authentication System Route
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = userRes.rows[0];

    if (!user || user.password_hash !== password) {
      return res.status(401).send('Invalid Terminal Username or Password String. <a href="/">Try Again</a>');
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, center_id: user.center_id },
      JWT_SECRET,
      { expiresIn: '5h' }
    );

    res.cookie('portal_token', token, { httpOnly: true, secure: true });

    if (user.role === 'Admin') res.redirect('/admin/dashboard');
    else res.redirect('/ddo/dashboard');
  } catch (err) {
    res.status(500).send('Login validation system breakdown.');
  }
});

app.get('/auth/logout', (req, res) => {
  res.clearCookie('portal_token');
  res.redirect('/');
});

// --- ADMIN DASHBOARD SECURE OPERATIONS ---

app.get('/admin/dashboard', verifyAccess('Admin'), async (req, res) => {
  try {
    const centers = await pool.query('SELECT * FROM training_centers ORDER BY s_no ASC');
    const trainees = await pool.query('SELECT t.*, c.name_of_center FROM trainees t LEFT JOIN training_centers c ON t.center_id = c.id');
    const documents = await pool.query('SELECT d.*, u.username FROM documents d LEFT JOIN users u ON d.uploaded_by = u.id');
    const ddos = await pool.query('SELECT u.id, u.username, c.name_of_center FROM users u LEFT JOIN training_centers c ON u.center_id = c.id WHERE u.role = \'DDO\'');

    res.render('admin', { 
      centers: centers.rows, 
      trainees: trainees.rows, 
      documents: documents.rows,
      ddos: ddos.rows
    });
  } catch (err) {
    res.status(500).send('Failed loading Super Admin Registry records.');
  }
});

// Admin Add Center Route
app.post('/admin/add-center', verifyAccess('Admin'), async (req, res) => {
  const { s_no, ddo_code, name_of_center, status, type, ddo_name } = req.body;
  try {
    await pool.query(
      'INSERT INTO training_centers (s_no, ddo_code, name_of_center, status, type, ddo_name) VALUES ($1, $2, $3, $4, $5, $6)',
      [s_no, ddo_code, name_of_center, status, type, ddo_name]
    );
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.status(500).send('Error adding new center record.');
  }
});

// Admin Inject New Custom Column Tool
app.post('/admin/add-column', verifyAccess('Admin'), async (req, res) => {
  const { columnName } = req.body;
  const safeKey = columnName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  try {
    await pool.query(`UPDATE training_centers SET dynamic_columns = dynamic_columns || jsonb_build_object($1, '')`, [safeKey]);
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.status(500).send('Failed to extend table schemas dynamic elements.');
  }
});

// Admin Update Dynamic Column Cell Values
app.post('/admin/update-cell', verifyAccess('Admin'), async (req, res) => {
  const { center_id, column_key, value } = req.body;
  try {
    await pool.query(
      `UPDATE training_centers SET dynamic_columns = jsonb_set(dynamic_columns, ARRAY[$1], to_jsonb($2::text)) WHERE id = $3`,
      [column_key, value, center_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed cell data alteration rewrite.' });
  }
});

// Admin Create New DDO Access Route
app.post('/admin/create-ddo', verifyAccess('Admin'), async (req, res) => {
  const { username, password, center_id } = req.body;
  try {
    await pool.query(
      'INSERT INTO users (username, password_hash, role, center_id) VALUES ($1, $2, \'DDO\', $3)',
      [username, password, center_id]
    );
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.status(500).send('Error generating unique DDO user credentials profile.');
  }
});

// Admin Post Document (Directorate-to-Center)
app.post('/admin/upload-doc', verifyAccess('Admin'), async (req, res) => {
  const { title, file_url } = req.body;
  try {
    await pool.query(
      'INSERT INTO documents (title, file_url, direction, uploaded_by) VALUES ($1, $2, \'Directorate-to-Center\', $3)',
      [title, file_url, req.user.id]
    );
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.status(500).send('Document routing declaration breakdown.');
  }
});

// --- DDO ISOLATED DASHBOARD OPERATIONS ---

app.get('/ddo/dashboard', verifyAccess('DDO'), async (req, res) => {
  try {
    const centerRes = await pool.query('SELECT * FROM training_centers WHERE id = $1', [req.user.center_id]);
    const trainees = await pool.query('SELECT * FROM trainees WHERE center_id = $1 ORDER BY id DESC', [req.user.center_id]);
    const documents = await pool.query(
      'SELECT d.*, u.username FROM documents d LEFT JOIN users u ON d.uploaded_by = u.id WHERE d.direction = \'Directorate-to-Center\' OR d.uploaded_by = $1',
      [req.user.id]
    );

    res.render('ddo', {
      center: centerRes.rows[0],
      trainees: trainees.rows,
      documents: documents.rows
    });
  } catch (err) {
    res.status(500).send('Failed loading isolated data metrics profile.');
  }
});

// DDO Modify Trainee Application Approval Status
app.post('/ddo/update-trainee-status', verifyAccess('DDO'), async (req, res) => {
  const { trainee_id, status } = req.body;
  try {
    await pool.query(
      'UPDATE trainees SET status = $1 WHERE id = $2 AND center_id = $3',
      [status, trainee_id, req.user.center_id]
    );
    res.redirect('/ddo/dashboard');
  } catch (err) {
    res.status(500).send('Authorization clearance manipulation block anomaly.');
  }
});

// DDO Upload Document (Center-to-Directorate)
app.post('/ddo/upload-doc', verifyAccess('DDO'), async (req, res) => {
  const { title, file_url } = req.body;
  try {
    await pool.query(
      'INSERT INTO documents (title, file_url, direction, uploaded_by) VALUES ($1, $2, \'Center-to-Directorate\', $3)',
      [title, file_url, req.user.id]
    );
    res.redirect('/ddo/dashboard');
  } catch (err) {
    res.status(500).send('Document failed to stream up to directorate logs.');
  }
});

module.exports = app;

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SIW Server operational on port ${PORT}`));
