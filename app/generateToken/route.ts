

export async function GET(request: Request) {


	const randomToken = crypto.randomUUID()




	return Response.json({ data: randomToken })
}
