const express = require('express');
const { Pool } = require('pg');
const path = require('path');
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

// Configure Absolute Paths for Vercel Serverless
app.set('views', path.join(__dirname, 'public', 'views'));
app.set('view engine', 'ejs');

// Apply Global Middlewares
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// --- 1. PUBLIC INDEX ROUTE ---
app.get('/', async (req, res) => {
  try {
    const centersRes = await pool.query('SELECT id, name_of_center FROM training_centers ORDER BY s_no ASC');
    res.render('index', { centers: centersRes.rows || [] });
  } catch (err) {
    console.error(err);
    res.render('index', { centers: [] }); // Safe fallback to prevent server failure
  }
});

// --- 2. PUBLIC SUBMISSION HANDLER ---
app.post('/submit-trainee', async (req, res) => {
  const { 
    full_name, cnic, mobile_number, center_id, course_name,
    district, tehsil, union_council, vendor_number, bank_account_number, easypaisa_number 
  } = req.body;

  try {
    const year = new Date().getFullYear();
    const countRes = await pool.query("SELECT COUNT(*) FROM trainees WHERE trainee_id LIKE $1", [`SIW-BAL-${year}-%`]);
    const nextSequence = String(parseInt(countRes.rows[0].count || 0) + 1).padStart(4, '0');
    const specialTraineeId = `SIW-BAL-${year}-${nextSequence}`;

    const insertQuery = `
      INSERT INTO trainees (
        trainee_id, full_name, cnic, mobile_number, center_id, course_name, 
        district, tehsil, union_council, vendor_number, bank_account_number, easypaisa_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;

    await pool.query(insertQuery, [
      specialTraineeId, full_name, cnic, mobile_number, center_id ? parseInt(center_id) : null, course_name,
      district, tehsil, union_council, vendor_number, bank_account_number, easypaisa_number
    ]);

    res.send(`Submission successful! Your Trainee ID is: ${specialTraineeId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database submission failure.");
  }
});

// --- 3. MANAGEMENT TERMINAL LOGIN PANEL ---
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = userResult.rows[0];

    if (!user || user.password_hash !== password) {
      return res.status(401).send('Invalid credential parameters matching terminal.');
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, center_id: user.center_id },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.cookie('portal_token', token, { httpOnly: true, secure: true });

    if (user.role === 'Admin') return res.redirect('/admin/dashboard');
    if (user.role === 'DDO') return res.redirect('/ddo/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('Authentication endpoint error.');
  }
});

// --- 4. SECURE ROLE GATEKEEPER ---
const verifyAccess = (role) => {
  return (req, res, next) => {
    const token = req.cookies.portal_token;
    if (!token) return res.status(403).send('Access Denied.');
    try {
      const verified = jwt.verify(token, JWT_SECRET);
      req.user = verified;
      if (role && req.user.role !== role) return res.status(403).send('Unauthorized.');
      next();
    } catch (err) {
      return res.status(400).send('Session expired.');
    }
  };
};

// --- 5. SUPER ADMIN CONTROL INTERFACE ---
app.get('/admin/dashboard', verifyAccess('Admin'), async (req, res) => {
  try {
    const centers = await pool.query('SELECT * FROM training_centers ORDER BY s_no ASC');
    const trainees = await pool.query('SELECT * FROM trainees ORDER BY id DESC');
    const documents = await pool.query('SELECT * FROM documents ORDER BY id DESC');
    const users = await pool.query('SELECT u.*, c.name_of_center FROM users u LEFT JOIN training_centers c ON u.center_id = c.id');
    
    res.render('admin', { 
      centers: centers.rows || [], 
      trainees: trainees.rows || [], 
      documents: documents.rows || [],
      users: users.rows || []
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error compiling dashboard arrays.');
  }
});

// --- 6. ADMIN CREATE EXTRA TABLE COLUMN ---
app.post('/admin/add-column', verifyAccess('Admin'), async (req, res) => {
  const { columnName } = req.body;
  const safeKey = columnName.trim().replace(/\s+/g, '_').toLowerCase();
  try {
    await pool.query(`UPDATE training_centers SET dynamic_columns = dynamic_columns || jsonb_build_object($1, '')`, [safeKey]);
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.status(500).send('Failed adding column metadata.');
  }
});

// --- 7. ADMIN REGISTER NEW USER ACCESS ACCOUNT ---
app.post('/admin/create-ddo', verifyAccess('Admin'), async (req, res) => {
  const { username, password, center_id } = req.body;
  try {
    await pool.query('INSERT INTO users (username, password_hash, role, center_id) VALUES ($1, $2, $3, $4)', [username, password, 'DDO', parseInt(center_id)]);
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.status(500).send('Failed creating localized user.');
  }
});

// --- 8. ADMIN UPLOAD DOCUMENT RESOURCE ---
app.post('/admin/upload-document', verifyAccess('Admin'), async (req, res) => {
  const { title, file_url } = req.body;
  try {
    await pool.query("INSERT INTO documents (title, file_url, direction, uploaded_by) VALUES ($1, $2, 'Directorate-to-Center', $3)", [title, file_url, req.user.id]);
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.status(500).send('Transmission error.');
  }
});

// --- 9. DDO ISOLATED DATA SCOPE ---
app.get('/ddo/dashboard', verifyAccess('DDO'), async (req, res) => {
  try {
    const centerRes = await pool.query('SELECT * FROM training_centers WHERE id = $1', [req.user.center_id]);
    const trainees = await pool.query('SELECT * FROM trainees WHERE center_id = $1 ORDER BY id DESC', [req.user.center_id]);
    const incoming = await pool.query("SELECT * FROM documents WHERE direction = 'Directorate-to-Center' ORDER BY id DESC");
    const outgoing = await pool.query("SELECT * FROM documents WHERE direction = 'Center-to-Directorate' AND uploaded_by = $1 ORDER BY id DESC", [req.user.id]);

    res.render('ddo', {
      center: centerRes.rows[0] || {},
      trainees: trainees.rows || [],
      incomingDocs: incoming.rows || [],
      outgoingDocs: outgoing.rows || []
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error initializing DDO scope matrix.');
  }
});

// --- 10. DDO RESPOND UPWARDS WITH TRANSMITTED DOCUMENT ---
app.post('/ddo/upload-document', verifyAccess('DDO'), async (req, res) => {
  const { title, file_url } = req.body;
  try {
    await pool.query("INSERT INTO documents (title, file_url, direction, uploaded_by) VALUES ($1, $2, 'Center-to-Directorate', $3)", [title, file_url, req.user.id]);
    res.redirect('/ddo/dashboard');
  } catch (err) {
    res.status(500).send('Upload tracking failed.');
  }
});

// --- 11. DDO UPDATE RECORD FIELD STATUS ---
app.post('/ddo/update-trainee-status', verifyAccess('DDO'), async (req, res) => {
  const { id, status } = req.body;
  try {
    await pool.query('UPDATE trainees SET status = $1 WHERE id = $2 AND center_id = $3', [status, parseInt(id), req.user.center_id]);
    res.redirect('/ddo/dashboard');
  } catch (err) {
    res.status(500).send('State change handling exception error.');
  }
});

// --- 12. LOGOUT LOGIC ---
app.get('/auth/logout', (req, res) => {
  res.clearCookie('portal_token');
  res.redirect('/');
});

app.listen(PORT, () => console.log(`Server execution initialized on port ${PORT}`));

module.exports = app;
