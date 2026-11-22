const db = window.supabase.createClient(
    window.SUPABASE_CONFIG.URL,
    window.SUPABASE_CONFIG.KEY
);

let currentSchoolId = null;

document.addEventListener("DOMContentLoaded", initializeReports);

async function initializeReports() {
    document.getElementById("reportDate").value =
        new Date().toISOString().split("T")[0];

    document.getElementById("generateReportButton")
        .addEventListener("click", generateReport);

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

    const { data: membership, error } = await db
        .from("school_memberships")
        .select("school_id")
        .eq("user_id", authData.user.id)
        .eq("role", "school_admin")
        .limit(1)
        .maybeSingle();

    if (error || !membership) {
        showMessage("School administrator membership not found.", true);
        return;
    }

    currentSchoolId = membership.school_id;

    await loadClasses();

    showMessage("Attendance reports ready.", false);
}

async function loadClasses() {
    const selector = document.getElementById("reportClass");

    const { data, error } = await db
        .from("classes")
        .select("id, class_name, arm")
        .eq("school_id", currentSchoolId)
        .order("class_name");

    if (error) {
        showMessage("Unable to load classes: " + error.message, true);
        return;
    }

    selector.innerHTML = '<option value="">All Classes</option>';

    (data || []).forEach(item => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.class_name +
            (item.arm ? " - " + item.arm : "");
        selector.appendChild(option);
    });
}

async function generateReport() {
    if (!currentSchoolId) {
        showMessage("School information is not available.", true);
        return;
    }

    const classId = document.getElementById("reportClass").value;
    const date = document.getElementById("reportDate").value;
    const session = document.getElementById("reportSession").value.trim();
    const term = document.getElementById("reportTerm").value;

    if (!session) {
        showMessage("Please enter the academic session.", true);
        return;
    }

    showMessage("Generating attendance report...", false);

    let query = db
        .from("attendance")
        .select("id, student_id, class_id, attendance_date, status")
        .eq("school_id", currentSchoolId)
        .eq("academic_session", session);

    if (classId) {
        query = query.eq("class_id", classId);
    }

    if (date) {
        query = query.eq("attendance_date", date);
    }

    if (term) {
        query = query.eq("term", term);
    }

    const { data: records, error } = await query
        .order("attendance_date", { ascending: false });

    if (error) {
        showMessage("Unable to generate report: " + error.message, true);
        return;
    }

    if (!records || records.length === 0) {
        displayEmptyReport();
        showMessage("No attendance records found for these filters.", true);
        return;
    }

    const studentIds = [...new Set(records.map(r => r.student_id))];
    const classIds = [...new Set(records.map(r => r.class_id))];

    const [studentResult, classResult] = await Promise.all([
        db.from("students")
            .select("id, admission_number, first_name, middle_name, last_name")
            .eq("school_id", currentSchoolId)
            .in("id", studentIds),

        db.from("classes")
            .select("id, class_name, arm")
            .eq("school_id", currentSchoolId)
            .in("id", classIds)
    ]);

    if (studentResult.error || classResult.error) {
        showMessage("Unable to load student or class details.", true);
        return;
    }

    const studentMap = {};
    (studentResult.data || []).forEach(student => {
        studentMap[student.id] = student;
    });

    const classMap = {};
    (classResult.data || []).forEach(item => {
        classMap[item.id] = item;
    });

    displayReport(records, studentMap, classMap);

    showMessage("Attendance report generated successfully.", false);
}

function displayReport(records, studentMap, classMap) {
    const total = records.length;

    const present = records.filter(r => r.status === "Present").length;
    const absent = records.filter(r => r.status === "Absent").length;
    const late = records.filter(r => r.status === "Late").length;
    const excused = records.filter(r => r.status === "Excused").length;

    // Present and Late both count as attendance.
    const rate = total > 0
        ? Math.round(((present + late) / total) * 100)
        : 0;

    document.getElementById("totalRecords").textContent = total;
    document.getElementById("totalPresent").textContent = present;
    document.getElementById("totalAbsent").textContent = absent;
    document.getElementById("totalLate").textContent = late;
    document.getElementById("totalExcused").textContent = excused;
    document.getElementById("attendanceRate").textContent = rate + "%";

    const list = document.getElementById("reportList");
    list.innerHTML = "";

    records.forEach((record, index) => {
        const student = studentMap[record.student_id];
        const classItem = classMap[record.class_id];

        const studentName = student
            ? [
                student.first_name,
                student.middle_name,
                student.last_name
              ].filter(Boolean).join(" ")
            : "Student not found";

        const className = classItem
            ? classItem.class_name +
              (classItem.arm ? " - " + classItem.arm : "")
            : "Class not found";

        const row = document.createElement("tr");

        const values = [
            index + 1,
            record.attendance_date,
            student ? student.admission_number : "-",
            studentName,
            className,
            record.status
        ];

        values.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });

        list.appendChild(row);
    });
}

function displayEmptyReport() {
    document.getElementById("totalRecords").textContent = 0;
    document.getElementById("totalPresent").textContent = 0;
    document.getElementById("totalAbsent").textContent = 0;
    document.getElementById("totalLate").textContent = 0;
    document.getElementById("totalExcused").textContent = 0;
    document.getElementById("attendanceRate").textContent = "0%";

    document.getElementById("reportList").innerHTML = `
        <tr>
            <td colspan="6">No attendance records found.</td>
        </tr>
    `;
}

function showMessage(message, isError) {
    const element = document.getElementById("reportMessage");
    element.textContent = message;
    element.style.color = isError ? "red" : "green";
}
