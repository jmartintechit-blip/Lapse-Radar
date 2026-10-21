// Skeleton scheduled function: proves the cron runs on the published deploy (replaced by the real checker in T15).
export default async (req: Request) => {
  const { next_run } = (await req.json()) as { next_run: string };
  console.log(`hola: scheduled run ok, next run ${next_run}`);
};

export const config = { schedule: '@hourly' };
