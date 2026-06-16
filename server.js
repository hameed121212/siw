const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();

// Use Neon database link from Vercel config
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Configure EJS view mapping inside Vercel architecture 
app.set('views', path.join(__dirname, 'public', 'views'));
app.set('view engine', 'ejs');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET || 'siw_balochistan_secret_2026';

// Middleware to verify session tokens
const gatewayAuth = (role) => {
  return (req, res, next) => {
    const token = req.cookies.portal_token;
    if (!token) return res.status(403).send('Access Denied: Please authenticate at the access panel.');
    try {
      const verified = jwt.verify(token, JWT_SECRET);
      req.user = verified;
      if (role && req.user.role !== role) {
        return res.status(403).send('Unauthorized access permissions.');
      }
      next();
    } catch (err) {
      res.clearCookie('portal_token');
      return res.status(400).send('Session timed out. Please log in again.');
    }
  };
};

// 1. PUBLIC ROUTE: Render the main landing page with current functional centers
app.get('/', async (req, res) => {
  try {
    const centersRes = await pool.query('SELECT * FROM training_centers ORDER BY s_no ASC');
    res.render('index', { centers: centersRes.rows });
  } catch (err) {
    res.status(500).send('System boot error matching database endpoints. Check database table schema logs.');
  }
});

// 2. PUBLIC ROUTE: Process public trainee submissions with auto-assigned IDs
app.post('/submit-trainee', async (req, res) => {
  const { 
    full_name, cnic, mobile_number, center_id, course_name,
    district, tehsil, union_council, vendor_number, bank_account_number, easypaisa_number 
  } = req.body;

  try {
    const year = new Date().getFullYear();
    const countRes = await pool.query("SELECT COUNT(*) FROM trainees WHERE trainee_id LIKE $1", [`SIW-BAL-${year}-%`]);
    const sequence = String(parseInt(countRes.rows[0].count) + 1).padStart(4, '0');
    const assignedId = `SIW-BAL-${year}-${sequence}`;

    const insertSql = `
      INSERT INTO trainees (
        trainee_id, full_name, cnic, mobile_number, center_id, course_name,
        district, tehsil, union_council, vendor_number, bank_account_number, easypaisa_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;

    await pool.query(insertSql, [
      assignedId, full_name, cnic, mobile_number, center_id, course_name,
      district, tehsil, union_council, vendor_number, bank_account_number, easypaisa_number
    ]);

    res.send(`<h1>Registration Completed Successfully!</h1><p>Your unique Trainee ID is: <strong>${assignedId}</strong></p><a href="/">Go Back</a>`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to register trainee record into database.');
  }
});

// 3. AUTH ROUTE: Secure portal authentication handling
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = userRes.rows[0];

    if (!user || user.password_hash !== password) {
      return res.status(401).send('Invalid administrative login credentials.');
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, center_id: user.center_id },
      JWT_SECRET,
      { expiresIn: '3h' }
    );

    res.cookie('portal_token', token, { httpOnly: true, secure: true });

    if (user.role === 'Admin') res.redirect('/admin/dashboard');
    else res.redirect('/ddo/dashboard');
  } catch (err) {
    res.status(500).send('Login validation system error.');
  }
});

// 4. ADMIN ROUTE: Render the complete core dashboard panel
app.get('/admin/dashboard', gatewayAuth('Admin'), async (req, res) => {
  try {
    const centers = await pool.query('SELECT * FROM training_centers ORDER BY s_no ASC');
    const trainees = await pool.query('SELECT t.*, c.name_of_center FROM trainees t LEFT JOIN training_centers c ON t.center_id = c.id');
    const docs = await pool.query('SELECT d.*, u.username FROM documents d LEFT JOIN users u ON d.uploaded_by = u.id');
    const ddos = await pool.query('SELECT id, username, center_id FROM users WHERE role = \'DDO\'');

    res.render('admin', { 
      centers: centers.rows, 
      trainees: trainees.rows, 
      documents: docs.rows,
      ddos: ddos.rows
    });
  } catch (err) {
    res.status(500).send('Error compiling admin view parameters.');
  }
});

// 5. ADMIN ROUTE: Inject custom keys dynamically into JSONB columns
app.post('/admin/add-column', gatewayAuth('Admin'), async (req, res) => {
  const { columnName } = req.body;
  const cleanKey = columnName.replace(/\s+/g, '_');
  try {
    await pool.query(`UPDATE training_centers SET dynamic_columns = dynamic_columns || jsonb_build_object($1, '')`, [cleanKey]);
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.status(500).send('Failed to insert new visual matrix column.');
  }
});

// 6. ADMIN ROUTE: Provision localized DDO accounts
app.post('/admin/create-ddo', gatewayAuth('Admin'), async (req, res) => {
  const { username, password, center_id } = req.body;
  try {
    await pool.query('INSERT INTO users (username, password_hash, role, center_id) VALUES ($1, $2, \'DDO\', $3)', [username, password, center_id]);
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.status(500).send('Error allocating new DDO profile.');
  }
});

// 7. SHARED ROUTE: Handle document movement uploading routes
app.post('/documents/upload', gatewayAuth(), async (req, res) => {
  const { title, file_url, direction } = req.body;
  try {
    await pool.query('INSERT INTO documents (title, file_url, direction, uploaded_by) VALUES ($1, $2, $3, $4)', [title, file_url, direction, req.user.id]);
    if (req.user.role === 'Admin') res.redirect('/admin/dashboard');
    else res.redirect('/ddo/dashboard');
  } catch (err) {
    res.status(500).send('Failed to post dispatch file registry.');
  }
});

// 8. DDO ROUTE: Isolated processing scope dashboard
app.get('/ddo/dashboard', gatewayAuth('DDO'), async (req, res) => {
  try {
    const centerRes = await pool.query('SELECT * FROM training_centers WHERE id = $1', [req.user.center_id]);
    const traineesRes = await pool.query('SELECT * FROM trainees WHERE center_id = $1', [req.user.center_id]);
    const docsRes = await pool.query('SELECT d.*, u.username FROM documents d LEFT JOIN users u ON d.uploaded_by = u.id WHERE d.direction = \'Directorate-to-Center\' OR d.uploaded_by = $1', [req.user.id]);

    res.render('ddo', {
      center: centerRes.rows[0],
      trainees: traineesRes.rows,
      documents: docsRes.rows
    });
  } catch (err) {
    res.status(500).send('Error loading localized operational parameters.');
  }
});

app.get('/auth/logout', (req, res) => {
  res.clearCookie('portal_token');
  res.redirect('/');
});

app.listen(3000, () => console.log('SIW Server running on port 3000'));
