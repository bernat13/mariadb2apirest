const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Database Configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'test',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Helper: Convert MySQL types to Swagger types
const getSwaggerType = (mysqlType) => {
    if (mysqlType.includes('int')) return 'integer';
    if (mysqlType.includes('decimal') || mysqlType.includes('double') || mysqlType.includes('float')) return 'number';
    if (mysqlType.includes('bool')) return 'boolean';
    return 'string';
};

const startServer = async () => {
    try {
        console.log(`Connecting to database ${dbConfig.database} at ${dbConfig.host}:${dbConfig.port}...`);
        const pool = mysql.createPool(dbConfig);

        // Check connection
        await pool.getConnection();
        console.log('Database connected successfully.');

        // Discover Schema
        const [columns] = await pool.query(`
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_KEY, EXTRA, IS_NULLABLE
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = ?
            ORDER BY TABLE_NAME, ORDINAL_POSITION
        `, [dbConfig.database]);

        if (columns.length === 0) {
            console.warn('No tables found in the database.');
        }

        const schema = {};
        columns.forEach(col => {
            if (!schema[col.TABLE_NAME]) {
                schema[col.TABLE_NAME] = {
                    primaryKeys: [],
                    columns: []
                };
            }
            schema[col.TABLE_NAME].columns.push(col);
            if (col.COLUMN_KEY === 'PRI') {
                schema[col.TABLE_NAME].primaryKeys.push(col.COLUMN_NAME);
            }
        });

        // Initialize Swagger Doc
        const swaggerDoc = {
            openapi: '3.0.0',
            info: {
                title: 'Dynamic MariaDB API',
                version: '1.0.0',
                description: `Auto-generated API for database: ${dbConfig.database}`
            },
            paths: {},
            components: {
                schemas: {}
            }
        };

        // Generate Routes and Swagger
        Object.keys(schema).forEach(tableName => {
            const tableInfo = schema[tableName];
            const primaryKey = tableInfo.primaryKeys[0] || 'id'; // Default to 'id' if no PK found (best effort)

            // Define Swagger Schema for this table
            const tableSchemaName = tableName.charAt(0).toUpperCase() + tableName.slice(1);
            const properties = {};
            const requiredFields = [];

            tableInfo.columns.forEach(col => {
                properties[col.COLUMN_NAME] = {
                    type: getSwaggerType(col.DATA_TYPE)
                };
                if (col.IS_NULLABLE === 'NO' && col.EXTRA !== 'auto_increment') {
                    requiredFields.push(col.COLUMN_NAME);
                }
            });

            swaggerDoc.components.schemas[tableSchemaName] = {
                type: 'object',
                properties: properties
            };
            if (requiredFields.length > 0) {
                swaggerDoc.components.schemas[tableSchemaName].required = requiredFields;
            }

            // --- CRUD --

            // 1. GET ALL
            const routePath = `/${tableName}`;
            app.get(routePath, async (req, res) => {
                try {
                    const [rows] = await pool.query(`SELECT * FROM \`${tableName}\``);
                    res.json(rows);
                } catch (err) {
                    res.status(500).json({ error: err.message });
                }
            });

            // Swagger for GET ALL
            swaggerDoc.paths[routePath] = {
                get: {
                    summary: `Get all records from ${tableName}`,
                    responses: {
                        '200': {
                            description: 'Successful operation',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'array',
                                        items: { $ref: `#/components/schemas/${tableSchemaName}` }
                                    }
                                }
                            }
                        }
                    }
                }
            };

            // 2. POST (Create)
            app.post(routePath, async (req, res) => {
                try {
                    const keys = Object.keys(req.body);
                    if (keys.length === 0) return res.status(400).json({ error: 'Empty body' });

                    const values = Object.values(req.body);
                    const placeholders = keys.map(() => '?').join(', ');
                    const columnsWrapped = keys.map(k => `\`${k}\``).join(', ');

                    const sql = `INSERT INTO \`${tableName}\` (${columnsWrapped}) VALUES (${placeholders})`;
                    const [result] = await pool.query(sql, values);
                    res.status(201).json({ id: result.insertId, ...req.body });
                } catch (err) {
                    res.status(500).json({ error: err.message });
                }
            });

            // Swagger for POST
            swaggerDoc.paths[routePath] = {
                ...swaggerDoc.paths[routePath],
                post: {
                    summary: `Create a new record in ${tableName}`,
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: `#/components/schemas/${tableSchemaName}` }
                            }
                        }
                    },
                    responses: {
                        '201': { description: 'Created' },
                        '500': { description: 'Database error' }
                    }
                }
            };

            // 3. GET ONE
            const itemRoutePath = `/${tableName}/:id`;
            app.get(itemRoutePath, async (req, res) => {
                try {
                    const id = req.params.id;
                    const [rows] = await pool.query(`SELECT * FROM \`${tableName}\` WHERE \`${primaryKey}\` = ?`, [id]);
                    if (rows.length === 0) return res.status(404).json({ error: 'Record not found' });
                    res.json(rows[0]);
                } catch (err) {
                    res.status(500).json({ error: err.message });
                }
            });

            // Swagger for GET ONE
            swaggerDoc.paths[`/${tableName}/{id}`] = {
                get: {
                    summary: `Get a single record from ${tableName}`,
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' } // Simplified
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'Successful operation',
                            content: {
                                'application/json': { schema: { $ref: `#/components/schemas/${tableSchemaName}` } }
                            }
                        },
                        '404': { description: 'Not found' }
                    }
                }
            };

            // 4. PUT (Update)
            app.put(itemRoutePath, async (req, res) => {
                try {
                    const id = req.params.id;
                    const keys = Object.keys(req.body);
                    if (keys.length === 0) return res.status(400).json({ error: 'Empty body' });

                    const setClause = keys.map(k => `\`${k}\` = ?`).join(', ');
                    const values = [...Object.values(req.body), id];

                    const sql = `UPDATE \`${tableName}\` SET ${setClause} WHERE \`${primaryKey}\` = ?`;
                    const [result] = await pool.query(sql, values);

                    if (result.affectedRows === 0) return res.status(404).json({ error: 'Record not found or no change' });
                    res.json({ message: 'Updated successfully' });
                } catch (err) {
                    res.status(500).json({ error: err.message });
                }
            });

            // Swagger for PUT
            swaggerDoc.paths[`/${tableName}/{id}`] = {
                ...swaggerDoc.paths[`/${tableName}/{id}`],
                put: {
                    summary: `Update a record in ${tableName}`,
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: `#/components/schemas/${tableSchemaName}` }
                            }
                        }
                    },
                    responses: {
                        '200': { description: 'Updated' },
                        '404': { description: 'Not found' },
                        '500': { description: 'Error' }
                    }
                }
            };

            // 5. DELETE
            app.delete(itemRoutePath, async (req, res) => {
                try {
                    const id = req.params.id;
                    const sql = `DELETE FROM \`${tableName}\` WHERE \`${primaryKey}\` = ?`;
                    const [result] = await pool.query(sql, [id]);
                    if (result.affectedRows === 0) return res.status(404).json({ error: 'Record not found' });
                    res.json({ message: 'Deleted successfully' });
                } catch (err) {
                    res.status(500).json({ error: err.message });
                }
            });

            // Swagger for DELETE
            swaggerDoc.paths[`/${tableName}/{id}`] = {
                ...swaggerDoc.paths[`/${tableName}/{id}`],
                delete: {
                    summary: `Delete a record from ${tableName}`,
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: {
                        '200': { description: 'Deleted' },
                        '404': { description: 'Not found' },
                        '500': { description: 'Error' }
                    }
                }
            };

        });

        // Setup Swagger UI
        app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
        console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);

        // Start Express
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Routes generated for: ${Object.keys(schema).join(', ')}`);
        });

    } catch (error) {
        console.error('Failed to initialize application:', error);
        // Do not exit, allow container to restart if needed, or retry connection logic
        // But for this simple implementation, we log and maybe retry loop could be better, 
        // but let's fail fast so Docker restarts it.
        process.exit(1);
    }
};

startServer();
