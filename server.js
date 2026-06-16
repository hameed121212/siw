require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(expressLayouts);

// Explicitly point Vercel to your absolute views directory path
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.set('layout', 'layout');

// Use temporary system memory for uploads instead of the crashing read-only disk storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

const checkAuth = (role) => (req, res, next) => {
  const token = req.cookies.user;
  if (!token) return res.status(401).send('Access Denied: Please Log In.');
  if (role && token.role !== role) return res.status(403).send('Forbidden: Unauthorized.');
  req.user = token;
  next();
};

/* --- PUBLIC ROUTES --- */

app.get('/', async (req, res) => {
  try {
    const centers = await pool.query('SELECT ddo_code, center_name FROM training_centers ORDER BY center_name ASC');
    res.render('index', { title: 'Trainee Admission Portal', centers: centers.rows, successId: null });
  } catch (err) {
    res.status(500).send('Database connection validation or view parsing fault.');
  }
});

app.post('/apply', async (req, res) => {
  const { full_name, cnic, phone, ddo_code } = req.body;
  try {
    const counts = await pool.query('SELECT COUNT(*) FROM trainees');
    const runningId = parseInt(counts.rows[0].count) + 1;
    const formattedId = `SIW-BAL-2026-${String(runningId).padStart(4, '0')}`;

    await pool.query(
      'INSERT INTO trainees (trainee_id, full_name, cnic, phone, ddo_code) VALUES ($1, $2, $3, $4, $5)',
      [formattedId, full_name, cnic, phone, ddo_code]
    );

    const centers = await pool.query('SELECT ddo_code, center_name FROM training_centers ORDER BY center_name ASC');
    res.render('index', { title: 'Registration Successful', centers: centers.rows, successId: formattedId });
  } catch (err) {
    res.status(500).send('Error saving submission profile.');
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) return res.status(400).send('User reference index not found.');
    
    const user = userResult.rows[0];
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).send('Invalid credential parameters.');

    res.cookie('user', { id: user.id, username: user.username, role: user.role, ddo_code: user.ddo_code });
    if (user.role === 'admin') return res.redirect('/admin');
    return res.redirect('/ddo');
  } catch (err) {
    res.status(500).send('Server Runtime Authentication Error.');
  }
});

app.get('/logout', (req, res) => {
  res.clearCookie('user');
  res.redirect('/');
});

/* --- ADMIN ROUTES --- */

app.get('/admin', checkAuth('admin'), async (req, res) => {
  try {
    const trainees = await pool.query('SELECT t.*, c.center_name FROM trainees t LEFT JOIN training_centers c ON t.ddo_code = c.ddo_code');
    const centers = await pool.query('SELECT * FROM training_centers');
    const docsToCenters = await pool.query("SELECT * FROM documents WHERE direction = 'directorate-to-center'");
    const docsToDir = await pool.query("SELECT * FROM documents WHERE direction = 'center-to-directorate'");
    const ddos = await pool.query("SELECT * FROM users WHERE role = 'ddo'");

    res.render('admin', {
      title: 'HQ System Admin Dashboard',
      trainees: trainees.rows,
      centers: centers.rows,
      docsToCenters: docsToCenters.rows,
      docsToDir: docsToDir.rows,
      ddos: ddos.rows
    });
  } catch (err) {
    res.status(500).send('Error fetching data arrays.');
  }
});

app.post('/admin/add-center', checkAuth('admin'), async (req, res) => {
  const { ddo_code, center_name, status, type, ddo_name } = req.body;
  try {
    await pool.query(
      'INSERT INTO training_centers (ddo_code, center_name, status, type, ddo_name) VALUES ($1, $2, $3, $4, $5)',
      [ddo_code, center_name, status, type, ddo_name]
    );
    res.redirect('/admin');
  } catch (err) {
    res.status(500).send('Could not append center.');
  }
});

app.post('/admin/add-column', checkAuth('admin'), async (req, res) => {
  const { column_name } = req.body;
  if (!column_name) return res.redirect('/admin');
  try {
    await pool.query(`UPDATE training_centers SET extra_fields = extra_fields || jsonb_build_object($1::text, ''::text)`, [column_name]);
    res.redirect('/admin');
  } catch (err) {
    res.status(500).send('Failed adding custom table structures.');
  }
});

app.post('/admin/create-ddo-user', checkAuth('admin'), async (req, res) => {
  const { username, password, ddo_code } = req.body;
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPass = await bcrypt.hash(password, salt);
    await pool.query('INSERT INTO users (username, password, role, ddo_code) VALUES ($1, $2, \'ddo\', $3)', [username, hashedPass, ddo_code]);
    res.redirect('/admin');
  } catch (err) {
    res.status(500).send('Execution collision: Username or DDO Code mapping constraint failure.');
  }
});

app.post('/admin/upload-doc', checkAuth('admin'), upload.single('document'), async (req, res) => {
  try {
    const dummyFilename = Date.now() + '-' + req.file.originalname;
    await pool.query('INSERT INTO documents (title, filename, direction) VALUES ($1, $2, $3)', [req.body.title, dummyFilename, 'directorate-to-center']);
    res.redirect('/admin');
  } catch (err) {
    res.status(500).send('File save execution fault.');
  }
});

/* --- DDO ROUTES --- */

app.get('/ddo', checkAuth('ddo'), async (req, res) => {
  const ddoCode = req.user.ddo_code;
  try {
    const trainees = await pool.query('SELECT * FROM trainees WHERE ddo_code = $1', [ddoCode]);
    const center = await pool.query('SELECT * FROM training_centers WHERE ddo_code = $1', [ddoCode]);
    const docsFromDir = await pool.query("SELECT * FROM documents WHERE direction = 'directorate-to-center'");
    const myDocs = await pool.query("SELECT * FROM documents WHERE direction = 'center-to-directorate' AND sender_ddo_code = $1", [ddoCode]);

    res.render('ddo', {
      title: `DDO Portal Panel - Center ID: ${ddoCode}`,
      trainees: trainees.rows,
      center: center.rows[0] || null,
      docsFromDir: docsFromDir.rows,
      myDocs: myDocs.rows
    });
  } catch (err) {
    res.status(500).send('Data engine access parsing exception error.');
  }
});

app.post('/ddo/upload-doc', checkAuth('ddo'), upload.single('document'), async (req, res) => {
  try {
    const dummyFilename = Date.now() + '-' + req.file.originalname;
    await pool.query(
      'INSERT INTO documents (title, filename, direction, sender_ddo_code) VALUES ($1, $2, $3, $4)',
      [req.body.title, dummyFilename, 'center-to-directorate', req.user.ddo_code]
    );
    res.redirect('/ddo');
  } catch (err) {
    res.status(500).send('DDO file pipeline upload failure.');
  }
});

module.exports = app; // Allows Vercel's serverless engine to export the route configurations correctly
