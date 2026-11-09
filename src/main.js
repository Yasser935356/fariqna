import { Client, Account, TablesDB, ID, Query } from "node-appwrite";
import { randomInt } from "node:crypto";

const DATABASE_ID = "6aef1e2d000fb1f56fdd";
const WORKSPACES_ID = "6aef1fdf0036603f6755";
const MEMBERS_ID = "6aef25b4002952a7a5ff";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    result += chars[randomInt(chars.length)];
  }

  return result;
}

export default async ({ req, res, error }) => {
  try {
    if (req.method === "GET") {
      return res.json({
        success: true,
        message: "وظيفة فريقنا تعمل"
      });
    }

    if (req.method !== "POST") {
      return res.json({
        success: false,
        message: "طريقة الطلب غير مدعومة"
      }, 405);
    }

    const jwt = req.headers["x-appwrite-user-jwt"];

    if (!jwt) {
      return res.json({
        success: false,
        message: "يجب تسجيل الدخول أولاً"
      }, 401);
    }

    const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
    const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;

    const userClient = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setJWT(jwt);

    const user = await new Account(userClient).get();

    const serverKey = req.headers["x-appwrite-key"];

    if (!serverKey) {
      throw new Error("مفتاح وظيفة Appwrite غير متوفر");
    }

    const serverClient = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(serverKey);

    const tables = new TablesDB(serverClient);

    const body = req.bodyJson;
if (body?.action === "listWorkspaces") {
  const memberships = await tables.listRows({
    databaseId: DATABASE_ID,
    tableId: MEMBERS_ID,
    queries: [
      Query.equal("userId", user.$id),
      Query.limit(100)
    ]
  });

  const workspaces = await Promise.all(
    memberships.rows.map(async (member) => {
      const workspace = await tables.getRow({
        databaseId: DATABASE_ID,
        tableId: WORKSPACES_ID,
        rowId: member.workspaceId
      });

      return {
        id: workspace.$id,
        name: workspace.name,
        desc: workspace.desc,
        code: workspace.ownerId === user.$id
          ? workspace.inviteCode
          : null,
        adminId: workspace.ownerId,
        role: member.role
      };
    })
  );

  return res.json({
    success: true,
    workspaces
  });
}
    if (body?.action === "joinWorkspace") {
  const inviteCode = typeof body.code === "string"
    ? body.code.trim().toUpperCase()
    : "";

  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(inviteCode)) {
    return res.json({
      success: false,
      message: "رمز الدعوة غير صحيح"
    }, 400);
  }

  const found = await tables.listRows({
    databaseId: DATABASE_ID,
    tableId: WORKSPACES_ID,
    queries: [
      Query.equal("inviteCode", inviteCode),
      Query.limit(2)
    ]
  });

  if (found.rows.length !== 1) {
    return res.json({
      success: false,
      message: "رمز الدعوة غير صحيح"
    }, 404);
  }

  const workspace = found.rows[0];

  const memberships = await tables.listRows({
    databaseId: DATABASE_ID,
    tableId: MEMBERS_ID,
    queries: [
      Query.equal("workspaceId", workspace.$id),
      Query.equal("userId", user.$id),
      Query.limit(1)
    ]
  });

  let role = "member";

  if (memberships.rows.length === 0) {
    await tables.createRow({
      databaseId: DATABASE_ID,
      tableId: MEMBERS_ID,
      rowId: ID.unique(),
      data: {
        workspaceId: workspace.$id,
        userId: user.$id,
        role: "member",
        joinedAt: new Date().toISOString()
      },
      permissions: []
    });
  } else {
    role = memberships.rows[0].role;
  }

  return res.json({
    success: true,
    message: "تم الانضمام إلى الغرفة بنجاح",
    workspace: {
      id: workspace.$id,
      name: workspace.name,
      desc: workspace.desc,
      adminId: workspace.ownerId,
      role: role
    }
  });
}
    if (!body || body.action !== "createWorkspace") {
      return res.json({
        success: false,
        message: "الطلب غير معروف"
      }, 400);
    }

    const name = typeof body.name === "string"
      ? body.name.trim() : "";

    const desc = typeof body.desc === "string"
      ? body.desc.trim() : "";

    if (!name || name.length > 40 || desc.length > 120) {
      return res.json({
        success: false,
        message: "تحقق من اسم الغرفة ووصفها"
      }, 400);
    }

    const inviteCode = generateCode();
    const createdAt = new Date().toISOString();

    let workspace;

    try {
      workspace = await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: WORKSPACES_ID,
        rowId: ID.unique(),
        data: {
          name: name,
          desc: desc,
          ownerId: user.$id,
          createdAt: createdAt,
          inviteCode: inviteCode
        },
        permissions: []
      });

      await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: MEMBERS_ID,
        rowId: ID.unique(),
        data: {
          workspaceId: workspace.$id,
          userId: user.$id,
          role: "admin",
          joinedAt: createdAt
        },
        permissions: []
      });

    } catch (err) {
      if (workspace) {
        try {
          await tables.deleteRow({
            databaseId: DATABASE_ID,
            tableId: WORKSPACES_ID,
            rowId: workspace.$id
          });
        } catch (_) {}
      }

      throw err;
    }

    return res.json({
      success: true,
      message: "تم إنشاء الغرفة بنجاح",
      workspace: {
        id: workspace.$id,
        name: name,
        desc: desc,
        code: inviteCode,
        adminId: user.$id
      }
    });

  } catch (err) {
    error(err.message);

    return res.json({
      success: false,
      message: "تعذر تنفيذ العملية"
    }, 500);
  }
};
