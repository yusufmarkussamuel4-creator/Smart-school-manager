// ==========================================
// SMART SCHOOL MANAGER
// ACADEMIC RESULTS MANAGEMENT
// ==========================================

let db;
let schoolId = "4c1c5a65-9557-4332-9a27-bc6754fe0301";
let studentsData = [];

const $ = id => document.getElementById(id);

function initializeResults() {
    try {
        if (!window.supabase || !window.SUPABASE_CONFIG) {
            throw new Error("Supabase configuration or library is missing.");
        }

        db = window.supabase.createClient(
            window.SUPABASE_CONFIG.URL,
            window.SUPABASE_CONFIG.KEY
        );

        loadClasses();

    } catch (error) {
        showClassError(error.message);
    }
}

function showClassError(message) {
    const select = $("classSelect");

    if (select) {
        select.innerHTML = '<option value="">Unable to load classes</option>';
    }

    console.error("Results initialization error:", message);
    alert("Academic Results Error: " + message);
}

// ==========================================
// LOAD CLASSES
// ==========================================

async function loadClasses() {
    const select = $("classSelect");

    if (!select) {
        showClassError("Class dropdown was not found in results.html.");
        return;
    }

    select.innerHTML = '<option value="">Loading classes...</option>';

    try {
        const { data, error } = await db
            .from("classes")
            .select("id, class_name, arm")
            .eq("school_id", schoolId)
            .order("class_name");

        if (error) throw error;

        select.innerHTML = '<option value="">Select Class</option>';

        if (!data || data.length === 0) {
            select.innerHTML = '<option value="">No classes found</option>';
            return;
        }

        data.forEach(cls => {
            const option = document.createElement("option");
            option.value = cls.id;
            option.textContent = cls.arm
                ? `${cls.class_name} ${cls.arm}`
                : cls.class_name;

            select.appendChild(option);
        });

    } catch (error) {
        showClassError(error.message);
    }
}

// ==========================================
// LOAD ASSIGNED SUBJECTS
// ==========================================

$("classSelect").addEventListener("change", loadSubjects);

async function loadSubjects() {
    const classId = $("classSelect").value;
    const subjectSelect = $("subjectSelect");

    subjectSelect.innerHTML = '<option value="">Loading subjects...</option>';
    $("resultsList").innerHTML = "";
    $("saveResultsBtn").disabled = true;

    if (!classId) {
        subjectSelect.innerHTML = '<option value="">Select Subject</option>';
        return;
    }

    try {
        const { data: assignments, error } = await db
            .from("class_subjects")
            .select("subject_id")
            .eq("school_id", schoolId)
            .eq("class_id", classId);

        if (error) throw error;

        const ids = [...new Set((assignments || []).map(x => x.subject_id))];

        if (!ids.length) {
            subjectSelect.innerHTML =
                '<option value="">No subjects assigned</option>';
            return;
        }

        const { data, error: subjectError } = await db
            .from("subjects")
            .select("id, subject_name, subject_code")
            .eq("school_id", schoolId)
            .in("id", ids)
            .order("subject_name");

        if (subjectError) throw subjectError;

        subjectSelect.innerHTML = '<option value="">Select Subject</option>';

        data.forEach(subject => {
            const option = document.createElement("option");
            option.value = subject.id;
            option.textContent = subject.subject_code
                ? `${subject.subject_name} (${subject.subject_code})`
                : subject.subject_name;

            subjectSelect.appendChild(option);
        });

    } catch (error) {
        subjectSelect.innerHTML =
            '<option value="">Unable to load subjects</option>';
        alert("Subject loading error: " + error.message);
    }
}

// ==========================================
// LOAD STUDENTS
// ==========================================

$("loadStudentsBtn").addEventListener("click", loadStudents);

async function loadStudents() {
    const classId = $("classSelect").value;
    const subjectId = $("subjectSelect").value;
    const session = $("sessionSelect").value;
    const term = $("termSelect").value;

    if (!classId || !subjectId || !session || !term) {
        alert("Select class, subject, session and term.");
        return;
    }

    const button = $("loadStudentsBtn");
    button.disabled = true;
    button.textContent = "Loading...";

    $("resultsList").innerHTML = "";
    $("saveResultsBtn").disabled = true;

    try {
        const { data: enrollments, error: enrollmentError } = await db
            .from("student_enrollments")
            .select("student_id")
            .eq("school_id", schoolId)
            .eq("class_id", classId)
            .eq("academic_session", session)
            .eq("term", term);

        if (enrollmentError) throw enrollmentError;

        const ids = [...new Set(
            (enrollments || []).map(x => x.student_id)
        )];

        if (!ids.length) {
            studentsData = [];
            $("resultsList").innerHTML =
                '<tr><td colspan="7">No enrolled students found.</td></tr>';
            updateSummary();
            return;
        }

        const { data: students, error: studentError } = await db
            .from("students")
            .select("id, admission_number, first_name, middle_name, last_name")
            .eq("school_id", schoolId)
            .is("archived_at", null)
            .in("id", ids)
            .order("first_name");

        if (studentError) throw studentError;

        const { data: existing, error: resultError } = await db
            .from("academic_results")
            .select("student_id, ca_score, exam_score")
            .eq("school_id", schoolId)
            .eq("subject_id", subjectId)
            .eq("academic_session", session)
            .eq("term", term)
            .in("student_id", ids);

        if (resultError) throw resultError;

        const resultMap = {};

        (existing || []).forEach(result => {
            resultMap[result.student_id] = result;
        });

        studentsData = (students || []).map(student => ({
            ...student,
            ca_score: Number(resultMap[student.id]?.ca_score || 0),
            exam_score: Number(resultMap[student.id]?.exam_score || 0)
        }));

        renderStudents();
        updateSummary();

        $("saveResultsBtn").disabled = studentsData.length === 0;

    } catch (error) {
        alert("Student loading error: " + error.message);
    } finally {
        button.disabled = false;
        button.textContent = "Load Students";
    }
}

// ==========================================
// DISPLAY STUDENTS
// ==========================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function renderStudents() {
    const table = $("resultsList");
    table.innerHTML = "";

    studentsData.forEach((student, index) => {
        const name = [
            student.first_name,
            student.middle_name,
            student.last_name
        ].filter(Boolean).join(" ");

        const total = student.ca_score + student.exam_score;

        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${escapeHTML(student.admission_number)}</td>
            <td>${escapeHTML(name)}</td>
            <td>
                <input type="number" class="ca-input"
                    data-index="${index}" min="0" max="40"
                    step="0.01" value="${student.ca_score}">
            </td>
            <td>
                <input type="number" class="exam-input"
                    data-index="${index}" min="0" max="60"
                    step="0.01" value="${student.exam_score}">
            </td>
            <td id="total-${index}">${total}</td>
            <td id="grade-${index}">${getGrade(total)}</td>
        `;

        table.appendChild(row);
    });

    document.querySelectorAll(".ca-input, .exam-input")
        .forEach(input => {
            input.addEventListener("input", updateScore);
        });
}

// ==========================================
// UPDATE SCORES
// ==========================================

function updateScore(event) {
    const index = Number(event.target.dataset.index);

    const caInput = document.querySelector(
        `.ca-input[data-index="${index}"]`
    );

    const examInput = document.querySelector(
        `.exam-input[data-index="${index}"]`
    );

    let ca = caInput.value === "" ? 0 : Number(caInput.value);
    let exam = examInput.value === "" ? 0 : Number(examInput.value);

    if (ca > 40) ca = 40;
    if (ca < 0) ca = 0;

    if (exam > 60) exam = 60;
    if (exam < 0) exam = 0;

    if (ca + exam > 100) {
        exam = 100 - ca;
    }

    caInput.value = ca;
    examInput.value = exam;

    studentsData[index].ca_score = ca;
    studentsData[index].exam_score = exam;

    const total = ca + exam;

    $(`total-${index}`).textContent = total;
    $(`grade-${index}`).textContent = getGrade(total);

    updateSummary();
}

// ==========================================
// GRADING
// ==========================================

function getGrade(score) {
    if (score >= 80) return "A - Excellent";
    if (score >= 70) return "B - Very Good";
    if (score >= 60) return "C - Good";
    if (score >= 50) return "D - Credit";
    if (score >= 45) return "E - Pass";
    return "F - Fail";
}

// ==========================================
// SUMMARY
// ==========================================

function updateSummary() {
    $("studentCount").textContent = studentsData.length;

    const entered = studentsData.filter(s =>
        s.ca_score > 0 || s.exam_score > 0
    ).length;

    $("enteredCount").textContent = entered;

    const total = studentsData.reduce(
        (sum, s) => sum + s.ca_score + s.exam_score, 0
    );

    $("classAverage").textContent = studentsData.length
        ? (total / studentsData.length).toFixed(2)
        : "0";
}

// ==========================================
// SAVE RESULTS
// ==========================================

$("saveResultsBtn").addEventListener("click", saveResults);

async function saveResults() {
    if (!studentsData.length) {
        alert("No results available to save.");
        return;
    }

    for (const student of studentsData) {
        if (
            student.ca_score < 0 ||
            student.ca_score > 40 ||
            student.exam_score < 0 ||
            student.exam_score > 60
        ) {
            alert("Invalid score. CA maximum is 40 and Exam maximum is 60.");
            return;
        }
    }

    const button = $("saveResultsBtn");
    button.disabled = true;
    button.textContent = "Saving...";

    try {
        const payload = studentsData.map(student => ({
            school_id: schoolId,
            student_id: student.id,
            subject_id: $("subjectSelect").value,
            academic_session: $("sessionSelect").value,
            term: $("termSelect").value,
            ca_score: student.ca_score,
            exam_score: student.exam_score
        }));

        const { error } = await db
            .from("academic_results")
            .upsert(payload, {
                onConflict:
                    "school_id,student_id,subject_id,academic_session,term"
            });

        if (error) throw error;

        alert("Results saved successfully!");

        await loadStudents();

    } catch (error) {
        alert("Saving error: " + error.message);
    } finally {
        button.disabled = studentsData.length === 0;
        button.textContent = "Save Results";
    }
}

// ==========================================
// START APPLICATION
// ==========================================

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeResults);
} else {
    initializeResults();
}
