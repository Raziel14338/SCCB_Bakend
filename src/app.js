import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { options } from './swaggerOptions';

const specs = swaggerJSDoc(options);

import cisternas from './routes/cisternaroutes.js'
import cupos from './routes/cuposroutes.js'

import usersRoutes from './routes/usersroutes.js'
import authRoutes from './routes/authroutes.js'

import telemetria from './routes/telemetriaroutes.js'

import operations from './routes/operationsroutes.js'

import analitics from './routes/analiticsroutes.js'
const app = express();




app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cisternas);
app.use(cupos);
app.use(telemetria);
app.use(operations);
app.use(usersRoutes);
app.use(authRoutes);
app.use(analitics);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(specs));



export default app;