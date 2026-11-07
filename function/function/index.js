import { Client, Account } from "node-appwrite";

export default async ({ req, res, log, error }) => {
  try {
    const jwt = req.headers["x-appwrite-user-jwt"];

    if (!jwt) {
      return res.json({ success: false, message: "يجب تسجيل الدخول" }, 401);
    }

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setJWT(jwt);

    const account = new Account(client);
    const user = await account.get();

    return res.json({
      success: true,
      message: "تم الاتصال بنجاح",
      userId: user.$id
    });
  } catch (err) {
    error(err.message);
    return res.json({ success: false, message: "فشل التحقق من الحساب" }, 401);
  }
};
