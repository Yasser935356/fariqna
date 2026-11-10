import { Client, Account, TablesDB, ID, Query, Users } from "node-appwrite";
import { randomInt } from "node:crypto";

const DATABASE_ID = "6aef1e2d000fb1f56fdd";
const WORKSPACES_ID = "6aef1fdf0036603f6755";
const MEMBERS_ID = "6aef25b4002952a7a5ff";
const TASKS_ID = "6aef29b0001e100d5905";
const TASK_ASSIGNEES_ID = "6aef2c360036aa8a7879";
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
    if (body?.action === "listTasks") {
  const workspaceId = typeof body.workspaceId === "string"
    ? body.workspaceId.trim()
    : "";

  if (!workspaceId) {
    return res.json({
      success: false,
      message: "معرف الغرفة مطلوب"
    }, 400);
  }

  const memberships = await tables.listRows({
    databaseId: DATABASE_ID,
    tableId: MEMBERS_ID,
    queries: [
      Query.equal("workspaceId", workspaceId),
      Query.equal("userId", user.$id),
      Query.limit(1)
    ]
  });

  if (memberships.rows.length === 0) {
    return res.json({
      success: false,
      message: "ليس لديك صلاحية لعرض مهام هذه الغرفة"
    }, 403);
  }

  const taskRows = await tables.listRows({
    databaseId: DATABASE_ID,
    tableId: TASKS_ID,
    queries: [
      Query.equal("workspaceId", workspaceId),
      Query.limit(100)
    ]
  });

  const taskIds = taskRows.rows.map(task => task.$id);

  let assignees = [];

  if (taskIds.length > 0) {
    const result = await tables.listRows({
      databaseId: DATABASE_ID,
      tableId: TASK_ASSIGNEES_ID,
      queries: [
        Query.equal("taskId", taskIds),
        Query.limit(100)
      ]
    });

    assignees = result.rows;
  }

  const tasks = taskRows.rows.map(task => ({
    id: task.$id,
    spaceId: task.workspaceId,
    title: task.title,
    details: task.description || "",
    status: task.status,
    createdBy: task.createdBy,
    assignees: assignees
      .filter(a => a.taskId === task.$id)
      .map(a => a.userId)
  }));

  return res.json({
    success: true,
    tasks
  });
}
    if (body?.action === "listMembers") {
  const workspaceId = typeof body.workspaceId === "string"
    ? body.workspaceId.trim()
    : "";

  if (!workspaceId) {
    return res.json({
      success: false,
      message: "معرف الغرفة مطلوب"
    }, 400);
  }

  // التأكد أن المستخدم عضو في الغرفة
  const access = await tables.listRows({
    databaseId: DATABASE_ID,
    tableId: MEMBERS_ID,
    queries: [
      Query.equal("workspaceId", workspaceId),
      Query.equal("userId", user.$id),
      Query.limit(1)
    ]
  });

  if (access.rows.length === 0) {
    return res.json({
      success: false,
      message: "ليس لديك صلاحية لعرض أعضاء هذه الغرفة"
    }, 403);
  }

  // استرجاع الأعضاء
  const membershipRows = await tables.listRows({
    databaseId: DATABASE_ID,
    tableId: MEMBERS_ID,
    queries: [
      Query.equal("workspaceId", workspaceId),
      Query.limit(100)
    ]
  });

  const users = new Users(serverClient);

  const members = await Promise.all(
    membershipRows.rows.map(async (member) => {
      const memberUser = await users.get({
        userId: member.userId
      });

      return {
        userId: member.userId,
        name: memberUser.name,
        role: member.role,
        joinedAt: member.joinedAt
      };
    })
  );

  return res.json({
    success: true,
    members: members
  });
}
    if (body?.action === "createTask") {
  const workspaceId = typeof body.workspaceId === "string"
    ? body.workspaceId.trim()
    : "";

  const title = typeof body.title === "string"
    ? body.title.trim()
    : "";

  const description = typeof body.description === "string"
    ? body.description.trim()
    : "";

  const assignees = Array.isArray(body.assignees)
    ? [...new Set(body.assignees)]
    : [];

  if (
    !workspaceId ||
    !title ||
    title.length > 120 ||
    description.length > 1000 ||
    assignees.length > 50 ||
    assignees.some(id => typeof id !== "string" || !id)
  ) {
    return res.json({
      success: false,
      message: "تحقق من بيانات المهمة"
    }, 400);
  }

  const membership = await tables.listRows({
    databaseId: DATABASE_ID,
    tableId: MEMBERS_ID,
    queries: [
      Query.equal("workspaceId", workspaceId),
      Query.equal("userId", user.$id),
      Query.limit(1)
    ]
  });

  if (membership.rows[0]?.role !== "admin") {
    return res.json({
      success: false,
      message: "مدير الغرفة فقط يستطيع إنشاء المهام"
    }, 403);
  }

  if (assignees.length > 0) {
    const members = await tables.listRows({
      databaseId: DATABASE_ID,
      tableId: MEMBERS_ID,
      queries: [
        Query.equal("workspaceId", workspaceId),
        Query.equal("userId", assignees),
        Query.limit(100)
      ]
    });

    const validIds = new Set(
      members.rows.map(member => member.userId)
    );

    if (assignees.some(id => !validIds.has(id))) {
      return res.json({
        success: false,
        message: "أحد المكلفين ليس عضوًا في الغرفة"
      }, 400);
    }
  }

  const task = await tables.createRow({
    databaseId: DATABASE_ID,
    tableId: TASKS_ID,
    rowId: ID.unique(),
    data: {
      workspaceId,
      title,
      description,
      status: "todo",
      createdBy: user.$id,
      createdAt: new Date().toISOString()
    },
    permissions: []
  });

  const createdAssignments = [];

  try {
    for (const userId of assignees) {
      const assignment = await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: TASK_ASSIGNEES_ID,
        rowId: ID.unique(),
        data: {
          taskId: task.$id,
          userId
        },
        permissions: []
      });

      createdAssignments.push(assignment.$id);
    }
  } catch (err) {
    for (const rowId of createdAssignments) {
      try {
        await tables.deleteRow({
          databaseId: DATABASE_ID,
          tableId: TASK_ASSIGNEES_ID,
          rowId
        });
      } catch (_) {}
    }

    try {
      await tables.deleteRow({
        databaseId: DATABASE_ID,
        tableId: TASKS_ID,
        rowId: task.$id
      });
    } catch (_) {}

    throw err;
  }

  return res.json({
    success: true,
    message: "تم إنشاء المهمة بنجاح",
    task: {
      id: task.$id,
      spaceId: workspaceId,
      title,
      details: description,
      status: "todo",
      assignees,
      completedBy: null
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
