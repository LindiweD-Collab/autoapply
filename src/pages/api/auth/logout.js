export async function GET() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': 'sb-access-token=; Path=/; HttpOnly; Max-Age=0',
    },
  });
}
