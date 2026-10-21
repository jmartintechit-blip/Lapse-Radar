import { withLambda, type HandlerResponse, type LambdaHandler } from '@netlify/aws-lambda-compat';
import serverless from 'serverless-http';
import { createApp } from '../../server/app';
import { createPgDb, type Db } from '../../server/db';

// serverless-http speaks the Lambda event format; withLambda adapts it to Netlify's current
// Request/Response API (the legacy Lambda-only mode stops being accepted on 2027-07-01).
// The cast is needed because serverless-http types its result as a bare object.
// binary: true makes every response base64, so bytes survive intact (otherwise non-ASCII bytes
// get re-encoded as UTF-8).
let db: Db | undefined;
const getDb = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // One pool per warm instance; Neon's pooled endpoint handles the connection fan-out.
  return (db ??= createPgDb(url));
};

const lambda = serverless(createApp(getDb), { binary: true }) as unknown as LambdaHandler;

const handler: LambdaHandler = async (event, context) => {
  const result = (await lambda(event, context)) as HandlerResponse;
  // new Response() throws if a 204/205/304 carries a body, even an empty string.
  if ([204, 205, 304].includes(result.statusCode)) delete result.body;
  return result;
};

export default withLambda(handler);

export const config = { path: '/api/*' };
