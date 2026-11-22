const db = window.supabase.createClient(
    window.SUPABASE_CONFIG.URL,
    window.SUPABASE_CONFIG.KEY
);

let currentSchoolId = null;
let currentUserId = null;
let currentStudents = [];

document.addEventListener("DOMContentLoaded", initializeAttendance);

async function initializeAttendance() {
    const dateInput = document.getElementById("attendanceDate");
    dateInput.value = new Date().toISOString().split("T")[0];

    document.getElementById("loadAttendanceButton")
        .addEventListener("click", loadStudents);

    document.getElementById("saveAttendanceButton")
        .addEventListener("click", saveAttendance);

    await verifyUser();
}

async function verifyUser() {
    showMessage("Checking login...", false);

    const { data: authData, error: authError } =
        await db.auth.getUser();

    if (authError || !authData.user) {
        showMessage("Please log in first.", true);
        return;
    }

    currentUserId = authData.user.id;

    const { data: membership, error } = await db
        .from("school_memberships")
        .select("school_id")
        .eq("user_id", currentUserId)
        .eq("role", "school_admin")
        .limit(1)
        .maybeSingle();

    if (error || !membership) {
        showMessage("School administrator membership not found.", true);
        return;
    }

    currentSchoolId = membership.school_id;

    await loadClasses();

    showMessage("Attendance system ready.", false);
}

async function loadClasses() {
    const selector = document.getElementById("attendanceClass");

    const { data, error } = await db
        .from("classes")
        .select("id, class_name, arm")
        .eq("school_id", currentSchoolId)
        .order("class_name");

    if (error) {
        showMessage("Unable to load classes: " + error.message, true);
        return;
    }

    selector.innerHTML = '<option value="">Select Class</option>';

    data.forEach(item => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.class_name +
            (item.arm ? " - " + item.arm : "");
        selector.appendChild(option);
    });
}

async function loadStudents() {
    const classId = document.getElementById("attendanceClass").value;
    const session = document.getElementById("attendanceSession").value.trim();
    const term = document.getElementById("attendanceTerm").value;
    const date = document.getElementById("attendanceDate").value;

    if (!classId || !session || !term || !date) {
        showMessage("Please select a class and complete all fields.", true);
        return;
    }

    showMessage("Loading students...", false);

    const { data: enrollments, error } = await db
        .from("student_enrollments")
        .select("student_id")
        .eq("school_id", currentSchoolId)
        .eq("class_id", classId)
        .eq("academic_session", session)
        .eq("term", term);

    if (error) {
        showMessage("Unable to load enrolments: " + error.message, true);
        return;
    }

    const studentIds = [...new Set(
        (enrollments || []).map(item => item.student_id)
    )];

    if (studentIds.length === 0) {
        currentStudents = [];
        displayStudents();
        showMessage("No students found for this class and session.", true);
        return;
    }

    const { data: students, error: studentError } = await db
        .from("students")
        .select("id, admission_number, first_name, middle_name, last_name, gender")
        .eq("school_id", currentSchoolId)
        .is("archived_at", null)
        .in("id", studentIds)
        .order("first_name");

    if (studentError) {
        showMessage("Unable to load students: " + studentError.message, true);
        return;
    }

    const { data: existing, error: attendanceError } = await db
        .from("attendance")
        .select("student_id, status")
        .eq("school_id", currentSchoolId)
        .eq("class_id", classId)
        .eq("attendance_date", date);

    if (attendanceError) {
        showMessage("Unable to check existing attendance: " +
            attendanceError.message, true);
        return;
    }

    const attendanceMap = {};
    (existing || []).forEach(record => {
        attendanceMap[record.student_id] = record.status;
    });

    currentStudents = (students || []).map(student => ({
        ...student,
        status: attendanceMap[student.id] || "Present"
    }));

    displayStudents();
    showMessage("Students loaded successfully.", false);
}

function displayStudents() {
    const list = document.getElementById("attendanceList");
    list.innerHTML = "";

    if (currentStudents.length === 0) {
        list.innerHTML = `
            <tr>
                <td colspan="5">No students found.</td>
            </tr>
        `;
        document.getElementById("attendanceSummary").textContent =
            "Total Students: 0";
        return;
    }

    currentStudents.forEach((student, index) => {
        const row = document.createElement("tr");

        const name = [
            student.first_name,
            student.middle_name,
            student.last_name
        ].filter(Boolean).join(" ");

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${escapeHTML(student.admission_number)}</td>
            <td>${escapeHTML(name)}</td>
            <td>${escapeHTML(student.gender || "-")}</td>
            <td>
                <select class="student-status"
                    data-student-id="${student.id}">
                    <option value="Present">Present</option>
                    <option value="Absent">Absent</option>
                    <option value="Late">Late</option>
                    <option value="Excused">Excused</option>
                </select>
            </td>
        `;

        list.appendChild(row);

        row.querySelector("select").value = student.status;
    });

    document.getElementById("attendanceSummary").textContent =
        "Total Students: " + currentStudents.length;
}

async function saveAttendance() {
    if (!currentSchoolId || currentStudents.length === 0) {
        showMessage("Load students before saving attendance.", true);
        return;
    }

    const classId = document.getElementById("attendanceClass").value;
    const session = document.getElementById("attendanceSession").value.trim();
    const term = document.getElementById("attendanceTerm").value;
    const date = document.getElementById("attendanceDate").value;

    const records = currentStudents.map(student => {
        const selector = document.querySelector(
            `.student-status[data-student-id="${student.id}"]`
        );

        return {
            school_id: currentSchoolId,
            student_id: student.id,
            class_id: classId,
            attendance_date: date,
            academic_session: session,
            term: term,
            status: selector.value,
            marked_by: currentUserId
        };
    });

    showMessage("Saving attendance...", false);

    const { error } = await db
        .from("attendance")
        .upsert(records, {
            onConflict: "school_id,student_id,attendance_date"
        });

    if (error) {
        showMessage("Error saving attendance: " + error.message, true);
        return;
    }

    showMessage("Attendance saved successfully!", false);
}

function showMessage(message, isError) {
    const element = document.getElementById("attendanceMessage");
    element.textContent = message;
    element.style.color = isError ? "red" : "green";
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}
