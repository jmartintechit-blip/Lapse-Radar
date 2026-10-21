import { withLambda, type HandlerResponse, type LambdaHandler } from '@netlify/aws-lambda-compat';
import serverless from 'serverless-http';
import { app } from '../../server/app';

// serverless-http speaks the Lambda event format; withLambda adapts it to Netlify's current
// Request/Response API (the legacy Lambda-only mode stops being accepted on 2027-07-01).
// The cast is needed because serverless-http types its result as a bare object.
// binary: true makes every response base64, so bytes survive intact (otherwise non-ASCII bytes
// get re-encoded as UTF-8).
const lambda = serverless(app, { binary: true }) as unknown as LambdaHandler;

const handler: LambdaHandler = async (event, context) => {
  const result = (await lambda(event, context)) as HandlerResponse;
  // new Response() throws if a 204/205/304 carries a body, even an empty string.
  if ([204, 205, 304].includes(result.statusCode)) delete result.body;
  return result;
};

export default withLambda(handler);

export const config = { path: '/api/*' };
