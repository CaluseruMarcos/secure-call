export async function GET(request: Request) {


	console.log("get request")




	return Response.json({ data: "hi" })
}
