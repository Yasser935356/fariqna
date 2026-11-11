












import { Client, Account, TablesDB, ID, Query, Users, Storage, Permission, Role } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { randomInt } from "node:crypto";

const DATABASE_ID = "6aef1e2d000fb1f56fdd";
const WORKSPACES_ID = "6aef1fdf0036603f6755";
const MEMBERS_ID = "6aef25b4002952a7a5ff";
const TASKS_ID = "6aef29b0001e100d5905";
const TASK_ASSIGNEES_ID = "6aef2c360036aa8a7879";
const MESSAGES_ID = "6af36073003490c9eff4";
const ATTACHMENTS_BUCKET_ID = "6af40a8700134c679043";
function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    result += chars[randomInt(chars.length)];
  }

  return result;
}
// ---------- التحقق من صلاحية الوصول للمحادثة ----------
async function canAccessChat(tables, workspaceId, taskId, userId) {
  const memberships = await tables.listRows({
    databaseId: DATABASE_ID,
    tableId: MEMBERS_ID,
    queries: [
      Query.equal("workspaceId", workspaceId),
      Query.equal("userId", userId),
      Query.limit(1)
    ]
  });

  if (memberships.rows.length === 0) return false;

  // المحادثة العامة متاحة لجميع أعضاء الغرفة
  if (!taskId) return true;

  // التأكد من أن المهمة تتبع الغرفة نفسها
  let task;

  try {
    task = await tables.getRow({
      databaseId: DATABASE_ID,
      tableId: TASKS_ID,
      rowId: taskId
    });
  } catch (_) {
    return false;
  }

  if (task.workspaceId !== workspaceId) return false;

  // المدير يستطيع الوصول لجميع محادثات المهام
  if (memberships.rows[0].role === "admin") return true;

  // العضو يستطيع الوصول للمهمة المكلف بها فقط
  const assignments = await tables.listRows({
    databaseId: DATABASE_ID,
    tableId: TASK_ASSIGNEES_ID,
    queries: [
      Query.equal("taskId", taskId),
      Query.equal("userId", userId),
      Query.limit(1)
    ]
  });

  return assignments.rows.length > 0;
}
// ---------- التحقق من نوع المرفق ----------
function getAttachmentType(buffer, filename) {
  const ext = String(filename || "").split(".").pop().toLowerCase();
  const hex = buffer.subarray(0, 12).toString("hex");
  const header = buffer.subarray(0, 12).toString("ascii");

  if (
    ext === "pdf" &&
    header.startsWith("%PDF-")
  ) return "pdf";

  if (
    ["jpg", "jpeg"].includes(ext) &&
    hex.startsWith("ffd8ff")
  ) return "image";

  if (
    ext === "png" &&
    hex.startsWith("89504e470d0a1a0a")
  ) return "image";

  if (
    ext === "gif" &&
    (header.startsWith("GIF87a") || header.startsWith("GIF89a"))
  ) return "image";

  if (
    ext === "webp" &&
    header.startsWith("RIFF") &&
    header.slice(8, 12) === "WEBP"
  ) return "image";

  return null;
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
const storage = new Storage(serverClient);
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
    reward: task.reward || "",
    dueAt: task.dueAt || null,
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
    // ---------- عرض رسائل الغرفة أو المهمة ----------
    // ---------- رفع مرفق وإرساله في المحادثة ----------
if (body?.action === "uploadAttachment") {
  const workspaceId = String(body.workspaceId || "").trim();
  const taskId = String(body.taskId || "").trim();

  const filename = String(body.fileName || "")
    .replace(/[\\/\x00-\x1f\x7f]/g, "_")
    .trim()
    .slice(0, 120);

  const base64 = String(body.fileBase64 || "");
const caption = String(body.caption || "").trim().slice(0, 2000);
  // الحد المبدئي: 2 ميجابايت للملف الواحد
  if (
    !workspaceId ||
    !filename ||
    !base64 ||
    base64.length > 2800000
  ) {
    return res.json({
      success: false,
      message: "بيانات الملف غير صحيحة أو حجمه كبير"
    }, 400);
  }

  // التأكد من صلاحية المستخدم قبل رفع الملف
  const allowed = await canAccessChat(
    tables, workspaceId, taskId, user.$id
  );

  if (!allowed) {
    return res.json({
      success: false,
      message: "ليس لديك صلاحية لإرسال مرفقات هنا"
    }, 403);
  }

  const buffer = Buffer.from(base64, "base64");

  if (!buffer.length || buffer.length > 2 * 1024 * 1024) {
    return res.json({
      success: false,
      message: "الحد الأقصى للملف 2 ميجابايت"
    }, 400);
  }

  const fileType = getAttachmentType(buffer, filename);

  if (!fileType) {
    return res.json({
      success: false,
      message: "يُسمح بالصور وملفات PDF فقط"
    }, 400);
  }

  // حفظ الملف دون صلاحيات قراءة عامة
  const uploaded = await storage.createFile({
    bucketId: ATTACHMENTS_BUCKET_ID,
    fileId: ID.unique(),
    file: InputFile.fromBuffer(buffer, filename),
    permissions: []
  });

  let created;

  try {
    created = await tables.createRow({
      databaseId: DATABASE_ID,
      tableId: MESSAGES_ID,
      rowId: ID.unique(),
      data: {
        workspaceId,
        senderId: user.$id,
        content: filename,
        caption: caption,
        messageType: fileType,
        attachmentId: uploaded.$id,
        ...(taskId ? { taskId } : {})
      },
      permissions: []
    });
  } catch (err) {
    await storage.deleteFile({
      bucketId: ATTACHMENTS_BUCKET_ID,
      fileId: uploaded.$id
    }).catch(() => {});
    throw err;
  }

  return res.json({
    success: true,
    message: "تم إرسال المرفق بنجاح",
    messageData: {
      id: created.$id,
      attachmentId: uploaded.$id,
      messageType: fileType
    }
  });
}
    // ---------- عرض وتنزيل مرفقات المحادثة ----------
if (body?.action === "getAttachment") {
  const workspaceId = String(body.workspaceId || "").trim();
  const taskId = String(body.taskId || "").trim();
  const messageId = String(body.messageId || "").trim();

  if (!workspaceId || !messageId) {
    return res.json({
      success: false,
      message: "بيانات المرفق غير مكتملة"
    }, 400);
  }

  // التحقق من صلاحية المستخدم
  const allowed = await canAccessChat(
    tables, workspaceId, taskId, user.$id
  );

  if (!allowed) {
    return res.json({
      success: false,
      message: "ليس لديك صلاحية لعرض هذا المرفق"
    }, 403);
  }

  // جلب الرسالة المرتبطة بالمرفق
  let message;

  try {
    message = await tables.getRow({
      databaseId: DATABASE_ID,
      tableId: MESSAGES_ID,
      rowId: messageId
    });
  } catch (_) {
    return res.json({
      success: false,
      message: "المرفق غير موجود"
    }, 404);
  }

  // التأكد أن المرفق ينتمي للمحادثة المطلوبة
  if (
    message.workspaceId !== workspaceId ||
    (message.taskId || "") !== taskId ||
    !message.attachmentId ||
    !["image", "pdf"].includes(message.messageType)
  ) {
    return res.json({
      success: false,
      message: "ليس لديك صلاحية لعرض هذا المرفق"
    }, 403);
  }

  // تنزيل الملف من التخزين الخاص
  const fileBytes = await storage.getFileDownload({
    bucketId: ATTACHMENTS_BUCKET_ID,
    fileId: message.attachmentId
  });

  const fileBuffer = Buffer.from(fileBytes);

  return res.json({
    success: true,
    fileName: message.content,
    messageType: message.messageType,
    fileBase64: fileBuffer.toString("base64")
  });
}
    if (body?.action === "listMessages") {
      const workspaceId = typeof body.workspaceId === "string"
        ? body.workspaceId.trim()
        : "";
      const taskId = typeof body.taskId === "string"
        ? body.taskId.trim()
        : "";

      if (!workspaceId) {
        return res.json({
          success: false,
          message: "معرّف الغرفة مطلوب"
        }, 400);
      }

      // لا يمكن قراءة المحادثة إلا لعضو في الغرفة.
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
          message: "ليس لديك صلاحية لعرض رسائل هذه الغرفة"
        }, 403);
      }

      // محادثة المهمة: المدير والمكلفون بهذه المهمة فقط.
      if (taskId) {
        let task;
        try {
          task = await tables.getRow({
            databaseId: DATABASE_ID,
            tableId: TASKS_ID,
            rowId: taskId
          });
        } catch (_) {
          return res.json({
            success: false,
            message: "المهمة غير موجودة"
          }, 404);
        }

        if (task.workspaceId !== workspaceId) {
          return res.json({
            success: false,
            message: "هذه المهمة لا تنتمي إلى الغرفة"
          }, 403);
        }

        if (memberships.rows[0].role !== "admin") {
          const assignments = await tables.listRows({
            databaseId: DATABASE_ID,
            tableId: TASK_ASSIGNEES_ID,
            queries: [
              Query.equal("taskId", taskId),
              Query.equal("userId", user.$id),
              Query.limit(1)
            ]
          });

          if (assignments.rows.length === 0) {
            return res.json({
              success: false,
              message: "محادثة المهمة مخصصة للمكلفين بها"
            }, 403);
          }
        }
      }

      // فصل الرسائل العامة عن رسائل المهمة.
      const messageQueries = [
        Query.equal("workspaceId", workspaceId),
        taskId ? Query.equal("taskId", taskId) : Query.isNull("taskId"),
        Query.orderDesc("$createdAt"),
        Query.limit(100)
      ];

      const messageRows = await tables.listRows({
        databaseId: DATABASE_ID,
        tableId: MESSAGES_ID,
        queries: messageQueries
      });

      // آخر 100 رسالة، مرتبة من الأقدم إلى الأحدث للعرض في الواجهة.
      const messages = messageRows.rows.map(msg => ({
        id: msg.$id,
        workspaceId: msg.workspaceId,
        taskId: msg.taskId || null,
        senderId: msg.senderId,
        content: msg.content || "",
        caption: msg.caption || "",
        messageType: msg.messageType,
        attachmentId: msg.attachmentId || null,
        createdAt: msg.$createdAt
      })).reverse();

      return res.json({
        success: true,
        messages
      });
    }

    // ---------- إرسال رسالة نصية ----------
    // سنضيف رفع الصور وملفات PDF في خطوة لاحقة عبر Appwrite Storage.
    if (body?.action === "sendMessage") {
      const workspaceId = typeof body.workspaceId === "string"
        ? body.workspaceId.trim()
        : "";
      const taskId = typeof body.taskId === "string"
        ? body.taskId.trim()
        : "";
      const content = typeof body.content === "string"
        ? body.content.trim()
        : "";
      const messageType = body.messageType || "text";

      if (!workspaceId || !content || content.length > 2000 || messageType !== "text") {
        return res.json({
          success: false,
          message: "تحقق من نص الرسالة (2000 حرف كحد أقصى)"
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
          message: "ليس لديك صلاحية لإرسال رسائل لهذه الغرفة"
        }, 403);
      }

      if (taskId) {
        let task;
        try {
          task = await tables.getRow({
            databaseId: DATABASE_ID,
            tableId: TASKS_ID,
            rowId: taskId
          });
        } catch (_) {
          return res.json({
            success: false,
            message: "المهمة غير موجودة"
          }, 404);
        }

        if (task.workspaceId !== workspaceId) {
          return res.json({
            success: false,
            message: "هذه المهمة لا تنتمي إلى الغرفة"
          }, 403);
        }

        if (memberships.rows[0].role !== "admin") {
          const assignments = await tables.listRows({
            databaseId: DATABASE_ID,
            tableId: TASK_ASSIGNEES_ID,
            queries: [
              Query.equal("taskId", taskId),
              Query.equal("userId", user.$id),
              Query.limit(1)
            ]
          });

          if (assignments.rows.length === 0) {
            return res.json({
              success: false,
              message: "محادثة المهمة مخصصة للمكلفين بها"
            }, 403);
          }
        }
      }

      const created = await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: MESSAGES_ID,
        rowId: ID.unique(),
        data: {
          workspaceId,
          senderId: user.$id,
          content,
          messageType: "text",
          ...(taskId ? { taskId } : {})
        },
        permissions: []
      });

      return res.json({
        success: true,
        message: "تم إرسال الرسالة بنجاح",
        messageData: {
          id: created.$id,
          workspaceId,
          taskId: taskId || null,
          senderId: user.$id,
          content,
          messageType: "text",
          attachmentId: null,
          createdAt: created.$createdAt
        }
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
          // ---------- تحديث حالة المهمة ----------
        // ---------- حذف المهمة ----------
    if (body?.action === "deleteTask") {
      const taskId = typeof body.taskId === "string"
        ? body.taskId.trim()
        : "";

      if (!taskId) {
        return res.json({
          success: false,
          message: "معرف المهمة مطلوب"
        }, 400);
      }

      const task = await tables.getRow({
        databaseId: DATABASE_ID,
        tableId: TASKS_ID,
        rowId: taskId
      });

      // التأكد أن المستخدم مدير الغرفة
      const memberships = await tables.listRows({
        databaseId: DATABASE_ID,
        tableId: MEMBERS_ID,
        queries: [
          Query.equal("workspaceId", task.workspaceId),
          Query.equal("userId", user.$id),
          Query.limit(1)
        ]
      });

      if (memberships.rows[0]?.role !== "admin") {
        return res.json({
          success: false,
          message: "مدير الغرفة فقط يستطيع حذف المهام"
        }, 403);
      }

      // حذف تعيينات المهمة أولًا
      const assignments = await tables.listRows({
        databaseId: DATABASE_ID,
        tableId: TASK_ASSIGNEES_ID,
        queries: [
          Query.equal("taskId", taskId),
          Query.limit(100)
        ]
      });

      for (const assignment of assignments.rows) {
        await tables.deleteRow({
          databaseId: DATABASE_ID,
          tableId: TASK_ASSIGNEES_ID,
          rowId: assignment.$id
        });
      }

      // حذف المهمة من قاعدة البيانات
      await tables.deleteRow({
        databaseId: DATABASE_ID,
        tableId: TASKS_ID,
        rowId: taskId
      });

      return res.json({
        success: true,
        message: "تم حذف المهمة بنجاح",
        taskId: taskId
      });
    }
    if (body?.action === "updateTask") {
      const taskId = typeof body.taskId === "string"
        ? body.taskId.trim()
        : "";

      const status = body.status;

      if (!taskId || !["todo", "doing", "done"].includes(status)) {
        return res.json({
          success: false,
          message: "بيانات تحديث المهمة غير صحيحة"
        }, 400);
      }

      const task = await tables.getRow({
        databaseId: DATABASE_ID,
        tableId: TASKS_ID,
        rowId: taskId
      });

      // التأكد أن المستخدم عضو في الغرفة
      const memberships = await tables.listRows({
        databaseId: DATABASE_ID,
        tableId: MEMBERS_ID,
        queries: [
          Query.equal("workspaceId", task.workspaceId),
          Query.equal("userId", user.$id),
          Query.limit(1)
        ]
      });

      if (!memberships.rows.length) {
        return res.json({
          success: false,
          message: "ليس لديك صلاحية لتحديث هذه المهمة"
        }, 403);
      }

      const isAdmin = memberships.rows[0].role === "admin";

      // العضو العادي يعدل المهام المعيّنة له فقط
      if (!isAdmin) {
        const assignments = await tables.listRows({
          databaseId: DATABASE_ID,
          tableId: TASK_ASSIGNEES_ID,
          queries: [
            Query.equal("taskId", taskId),
            Query.equal("userId", user.$id),
            Query.limit(1)
          ]
        });

        if (!assignments.rows.length) {
          return res.json({
            success: false,
            message: "هذه المهمة ليست معيّنة لك"
          }, 403);
        }
      }

      // حفظ الحالة الجديدة في قاعدة البيانات
      const updatedTask = await tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: TASKS_ID,
        rowId: taskId,
        data: {
          status: status
        }
      });

      return res.json({
        success: true,
        message: "تم تحديث حالة المهمة",
        task: {
          id: updatedTask.$id,
          spaceId: updatedTask.workspaceId,
          status: updatedTask.status
        }
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
  const reward = typeof body.reward === "string" ? body.reward.trim() : "";
 if (!reward || reward.length > 255) {
  return res.json({
    success: false,
    message: "يجب كتابة مكافأة المهمة (255 حرفًا كحد أقصى)"
  }, 400);
}         
const dueAtValue = typeof body.dueAt === "string"
  ? body.dueAt.trim()
  : "";

const dueAt = dueAtValue ? new Date(dueAtValue) : null;

if (dueAt && Number.isNaN(dueAt.getTime())) {
  return res.json({
    success: false,
    message: "موعد التسليم غير صحيح"
  }, 400);
}
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
      reward,
      status: "todo",
      createdBy: user.$id,
     createdAt: new Date().toISOString(),
...(dueAt ? { dueAt: dueAt.toISOString() } : {})
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
      reward,
      status: "todo",
      assignees,
      dueAt: dueAt ? dueAt.toISOString() : null,
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




