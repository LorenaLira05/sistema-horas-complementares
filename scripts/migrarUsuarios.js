require('dotenv').config({
  path: require('path').resolve(__dirname, '../.env')
});

const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

async function migrarUsuarios() {
  try {
    console.log('Iniciando migração de usuários...');

    const senhaPadrao = await bcrypt.hash('123456', 10);

    await pool.query('BEGIN');

    const students = await pool.query(`
      SELECT student_id, student_email
      FROM atividades_complementares.students
    `);

    for (const s of students.rows) {
      const login = s.student_email?.trim()
        ? s.student_email.trim()
        : `student_${s.student_id}`;

      await pool.query(`
        INSERT INTO atividades_complementares.users
          (login, password_hash, role, student_id)
        VALUES ($1, $2, 'STUDENT', $3)
        ON CONFLICT (student_id) DO NOTHING
      `, [login, senhaPadrao, s.student_id]);
    }
    
    const coordinators = await pool.query(`
      SELECT coordinator_id
      FROM atividades_complementares.coordinators
    `);

    for (const c of coordinators.rows) {
      const login = `coord_${c.coordinator_id}`;

      await pool.query(`
        INSERT INTO atividades_complementares.users
          (login, password_hash, role, coordinator_id)
        VALUES ($1, $2, 'COORDINATOR', $3)
        ON CONFLICT (coordinator_id) DO NOTHING
      `, [login, senhaPadrao, c.coordinator_id]);
    }

    await pool.query('COMMIT');

    console.log('Migração concluída com sucesso!');
    await pool.end();
    process.exit(0);

  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Erro na migração:', err);
    process.exit(1);
  }
}

migrarUsuarios();