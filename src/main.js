import { Client, TablesDB } from "node-appwrite";

export default async ({ req, res, log, error }) => {
  try {
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const tablesDB = new TablesDB(client);

    await tablesDB.listRows({
      databaseId: "6aef1e2d000fb1f56fdd",
      tableId: "6aef1fdf0036603f6755",
      queries: [],
      limit: 1
    });

    return res.json({
      success: true,
      message: "تم الاتصال بقاعدة البيانات بنجاح"
    });
  } catch (err) {
    error(err.message);

    return res.json({
      success: false,
      message: "فشل الاتصال بقاعدة البيانات"
    }, 500);
  }
};
