document.addEventListener("DOMContentLoaded", async () => {
const SUPABASE_URL = window.SUPABASE_CONFIG.URL;
const SUPABASE_KEY = window.SUPABASE_CONFIG.KEY;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const classSelect = document.getElementById("classSelect");
const studentSelect = document.getElementById("studentSelect");
const sessionSelect = document.getElementById("sessionSelect");
const termSelect = document.getElementById("termSelect");
const generateBtn = document.getElementById("generateBtn");
const reportMessage = document.getElementById("reportMessage");
const reportSheet = document.getElementById("reportSheet");
const printBtn = document.getElementById("printBtn");

let schoolId = null;

function showMessage(message, type = "error") {
    reportMessage.textContent = message;
    reportMessage.style.color = type === "success" ? "green" : "red";
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value ?? "";
}

function getGrade(score) {
    if (score >= 80) return "A - Excellent";
    if (score >= 70) return "B - Very Good";
    if (score >= 60) return "C - Good";
    if (score >= 50) return "D - Credit";
    if (score >= 45) return "E - Pass";
    return "F - Fail";
}

function getFullName(student) {
    return [
        student.first_name,
        student.middle_name,
        student.last_name
    ].filter(Boolean).join(" ");
}

async function initialize() {
    try {
        const { data: authData, error: authError } =
            await db.auth.getUser();

        if (authError || !authData.user) {
            showMessage("Please log in to continue.");
            return;
        }

        const { data: membership, error: membershipError } =
            await db
                .from("school_memberships")
                .select("school_id")
                .eq("user_id", authData.user.id)
                .eq("role", "school_admin")
                .limit(1)
                .maybeSingle();

        if (membershipError || !membership) {
            showMessage("School membership could not be found.");
            return;
        }

        schoolId = membership.school_id;

setText("schoolName", "UBE PRIMARY SCHOOL UNGWAN LAFIYA");

await loadClasses();

    } catch (error) {
        console.error(error);
        showMessage("Unable to initialize the report card.");
    }
}

async function loadSchool() {
    const { data, error } = await db
        .from("schools")
        .select("*")
        .eq("id", schoolId)
        .maybeSingle();

    if (error) {
        console.error("School loading error:", error);
        return;
    }

    const possibleNames = [
        data?.school_name,
        data?.name,
        data?.institution_name,
        data?.school_title
    ];

    const schoolName = possibleNames.find(
        value => typeof value === "string" && value.trim()
    );

    setText(
        "schoolName",
        schoolName || "UBE PRIMARY SCHOOL UNGWAN LAFIYA"
    );
}

async function loadClasses() {
    classSelect.innerHTML = '<option value="">Loading classes...</option>';

    const { data, error } = await db
        .from("classes")
        .select("id, class_name, arm")
        .eq("school_id", schoolId)
        .order("class_name");

    if (error) {
        console.error(error);
        classSelect.innerHTML =
            '<option value="">Unable to load classes</option>';
        return;
    }

    classSelect.innerHTML =
        '<option value="">Select Class</option>';

    (data || []).forEach(item => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.arm
            ? `${item.class_name} ${item.arm}`
            : item.class_name;
        classSelect.appendChild(option);
    });
}

async function loadStudents() {
    studentSelect.innerHTML =
        '<option value="">Select Student</option>';

    reportSheet.style.display = "none";

    const classId = classSelect.value;
    const session = sessionSelect.value;
    const term = termSelect.value;

    if (!classId || !session || !term) return;

    studentSelect.innerHTML =
        '<option value="">Loading students...</option>';

    const { data: enrollments, error: enrollmentError } = await db
        .from("student_enrollments")
        .select("student_id")
        .eq("school_id", schoolId)
        .eq("class_id", classId)
        .eq("academic_session", session)
        .eq("term", term);

    if (enrollmentError) {
        console.error(enrollmentError);
        studentSelect.innerHTML =
            '<option value="">Unable to load students</option>';
        return;
    }

    const studentIds = [
        ...new Set((enrollments || []).map(item => item.student_id))
    ];

    if (studentIds.length === 0) {
        studentSelect.innerHTML =
            '<option value="">No students enrolled in this selection</option>';
        return;
    }

    const { data: students, error: studentError } = await db
        .from("students")
        .select("id, admission_number, first_name, middle_name, last_name")
        .eq("school_id", schoolId)
        .in("id", studentIds)
        .is("archived_at", null)
        .order("first_name");

    if (studentError) {
        console.error(studentError);
        studentSelect.innerHTML =
            '<option value="">Unable to load students</option>';
        return;
    }

    studentSelect.innerHTML =
        '<option value="">Select Student</option>';

    (students || []).forEach(student => {
        const option = document.createElement("option");
        option.value = student.id;
        option.textContent =
            `${getFullName(student)} (${student.admission_number})`;
        studentSelect.appendChild(option);
    });
}

function addCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = value ?? "";
    row.appendChild(cell);
}

async function generateReport() {
    const classId = classSelect.value;
    const studentId = studentSelect.value;
    const session = sessionSelect.value;
    const term = termSelect.value;

    if (!classId || !studentId || !session || !term) {
        showMessage("Please select the class, student, session and term.");
        return;
    }

    generateBtn.disabled = true;
    generateBtn.textContent = "Generating...";
    reportSheet.style.display = "none";

    try {
        const { data: student, error: studentError } = await db
            .from("students")
            .select("*")
            .eq("id", studentId)
            .eq("school_id", schoolId)
            .single();

        if (studentError) throw studentError;

        const { data: classData, error: classError } = await db
            .from("classes")
            .select("class_name, arm")
            .eq("id", classId)
            .eq("school_id", schoolId)
            .single();

        if (classError) throw classError;

        const { data: results, error: resultsError } = await db
            .from("academic_results")
            .select("subject_id, ca_score, exam_score, total_score")
            .eq("school_id", schoolId)
            .eq("student_id", studentId)
            .eq("academic_session", session)
            .eq("term", term);

        if (resultsError) throw resultsError;

        const subjectIds = [
            ...new Set((results || []).map(item => item.subject_id))
        ];

        let subjects = [];

        if (subjectIds.length > 0) {
            const { data, error } = await db
                .from("subjects")
                .select("id, subject_name, subject_code")
                .eq("school_id", schoolId)
                .in("id", subjectIds);

            if (error) throw error;
            subjects = data || [];
        }

        const subjectMap = {};
        subjects.forEach(subject => {
            subjectMap[subject.id] = subject;
        });

        const table = document.getElementById("reportResults");
        table.innerHTML = "";

        let grandTotal = 0;

        (results || []).forEach(result => {
            const subject = subjectMap[result.subject_id];
            if (!subject) return;

            const total = Number(result.total_score ?? 0);
            const ca = Number(result.ca_score ?? 0);
            const exam = Number(result.exam_score ?? 0);

            grandTotal += total;

            const row = document.createElement("tr");

            addCell(row, subject.subject_name);
            addCell(row, subject.subject_code || "-");
            addCell(row, ca);
            addCell(row, exam);
            addCell(row, total);
            addCell(row, getGrade(total));

            table.appendChild(row);
        });

        const subjectCount = table.children.length;
        const average = subjectCount > 0
            ? grandTotal / subjectCount
            : 0;

        setText("studentName", getFullName(student));
        setText("admissionNumber", student.admission_number);

        setText(
            "studentClass",
            classData.arm
                ? `${classData.class_name} ${classData.arm}`
                : classData.class_name
        );

        setText("academicSession", session);
        setText("academicTerm", term);
        setText("reportSession", `${session} - ${term}`);

        setText("totalScore", grandTotal.toFixed(1));
        setText("averageScore", average.toFixed(1));
        setText("subjectCount", subjectCount);

        setText(
            "overallGrade",
            subjectCount > 0 ? getGrade(average) : "No Results"
        );
// LOAD STUDENT ATTENDANCE SUMMARY
const { data: attendance, error: attendanceError } = await db
    .from("attendance")
    .select("status")
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .eq("class_id", classId)
    .eq("academic_session", session)
    .eq("term", term);

if (attendanceError) {
    console.error("Attendance error:", attendanceError);
} else {
    const records = attendance || [];

    const present = records.filter(r => r.status === "Present").length;
    const absent = records.filter(r => r.status === "Absent").length;
    const late = records.filter(r => r.status === "Late").length;
    const excused = records.filter(r => r.status === "Excused").length;

    const total = records.length;

    const attendanceRate = total > 0
        ? ((present + late) / total * 100).toFixed(1)
        : 0;

    setText("attendanceTotal", total);
    setText("attendancePresent", present);
    setText("attendanceAbsent", absent);
    setText("attendanceLate", late);
    setText("attendanceExcused", excused);
    setText("attendanceRate", attendanceRate + "%");
}
        const passport = document.getElementById("studentPassport");

        if (passport) {
            if (student.passport_url) {
                passport.src = student.passport_url;
                passport.style.display = "block";
            } else {
                passport.removeAttribute("src");
                passport.style.display = "none";
            }
        }

        setText(
            "teacherComment",
            subjectCount > 0
                ? "Class teacher's comment: __________________________"
                : "No academic results recorded for this student."
        );

        setText(
            "headComment",
            "Head teacher's comment: __________________________"
        );

        reportSheet.style.display = "block";
        showMessage("Report card generated successfully.", "success");

    } catch (error) {
        console.error("Report generation error:", error);
        showMessage(
            "Unable to generate report card. Please check the selections and try again."
        );
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = "Generate Report";
    }
}

classSelect.addEventListener("change", loadStudents);
sessionSelect.addEventListener("change", loadStudents);
termSelect.addEventListener("change", loadStudents);

generateBtn.addEventListener("click", generateReport);

printBtn.addEventListener("click", () => {
    window.print();
});

await initialize();

});
