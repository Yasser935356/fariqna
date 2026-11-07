import { Client, TablesDB } from "node-appwrite";

export default async ({ req, res, log, error }) => {
  try {
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(req.headers["x-appwrite-key"]);

    const tablesDB = new TablesDB(client);

    const result = await tablesDB.listRows({
      databaseId: "6aef1e2d000fb1f56fdd",
      tableId: "6aef1fdf0036603f6755",
      limit: 1
    });

    return res.json({
      success: true,
      message: "تم الاتصال بقاعدة البيانات بنجاح",
      connected: true
    });

  } catch (err) {
    error(JSON.stringify({
      message: err.message,
      cause: err.cause?.message,
      code: err.cause?.code
    }));

    return res.json({
      success: false,
      message: err.message,
      cause: err.cause?.message || null,
      code: err.cause?.code || null
    }, 500);
  }
};
