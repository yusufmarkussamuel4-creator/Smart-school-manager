// ==========================================
// SMART SCHOOL MANAGER
// ACADEMIC RESULTS MANAGEMENT
// ==========================================

let db;
let currentSchoolId = null;
let studentsData = [];
let academicSessions = [];

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener("DOMContentLoaded", initializeResults);

async function initializeResults() {
    try {
        showMessage("Connecting to school database...", "info");

        if (!window.SUPABASE_CONFIG || !window.supabase) {
            throw new Error("Supabase configuration is missing.");
        }

        db = window.supabase.createClient(
            window.SUPABASE_CONFIG.URL,
            window.SUPABASE_CONFIG.KEY
        );

        await verifyUser();
        await loadClasses();
        await loadAcademicSessions();

        document.getElementById("classSelect")
            .addEventListener("change", async () => {
                studentsData = [];
                renderStudents();
                updateSummary();

                document.getElementById("saveResultsBtn").disabled = true;

                await loadSubjects();
            });

        document.getElementById("loadStudentsBtn")
            .addEventListener("click", loadStudents);

        document.getElementById("saveResultsBtn")
            .addEventListener("click", saveResults);

        showMessage("Academic Results Management is ready.", "success");

    } catch (error) {
        console.error("Initialization error:", error);

        showMessage(error.message, "error");

        document.getElementById("classSelect").innerHTML =
            '<option value="">Unable to load classes</option>';
    }
}

// ==========================================
// VERIFY USER AND SCHOOL
// ==========================================

async function verifyUser() {
    const { data, error } = await db.auth.getUser();

    if (error) throw error;

    if (!data.user) {
        throw new Error("Please log in before accessing Results Management.");
    }

    const { data: membership, error: membershipError } = await db
        .from("school_memberships")
        .select("school_id")
        .eq("user_id", data.user.id)
        .eq("role", "school_admin")
        .limit(1)
        .maybeSingle();

    if (membershipError) throw membershipError;

    if (!membership) {
        throw new Error("No school administrator membership was found.");
    }

    currentSchoolId = membership.school_id;
}

// ==========================================
// LOAD CLASSES
// ==========================================

async function loadClasses() {
    const select = document.getElementById("classSelect");

    select.innerHTML = '<option value="">Loading classes...</option>';

    const { data, error } = await db
        .from("classes")
        .select("id, class_name, arm")
        .eq("school_id", currentSchoolId)
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
        option.textContent =
            cls.class_name + (cls.arm ? " - " + cls.arm : "");

        select.appendChild(option);
    });
}

// ==========================================
// LOAD ACADEMIC SESSIONS
// ==========================================

async function loadAcademicSessions() {
    const select = document.getElementById("sessionSelect");

    select.innerHTML = '<option value="">Loading sessions...</option>';

    const { data, error } = await db
        .from("academic_sessions")
        .select("id, session_name, is_active, start_date")
        .eq("school_id", currentSchoolId)
        .order("start_date", { ascending: false });

    if (error) throw error;

    academicSessions = data || [];

    select.innerHTML = '<option value="">Select Session</option>';

    if (!academicSessions.length) {
        select.innerHTML =
            '<option value="">No academic sessions found</option>';

        return;
    }

    academicSessions.forEach(session => {
        const option = document.createElement("option");

        option.value = session.session_name;
        option.textContent = session.session_name;

        if (session.is_active) {
            option.selected = true;
        }

        select.appendChild(option);
    });
}

// ==========================================
// LOAD ASSIGNED SUBJECTS
// ==========================================

async function loadSubjects() {
    const classId = document.getElementById("classSelect").value;
    const select = document.getElementById("subjectSelect");

    select.innerHTML = '<option value="">Loading subjects...</option>';

    document.getElementById("resultsList").innerHTML =
        '<tr><td colspan="7">Select a subject to continue.</td></tr>';

    document.getElementById("saveResultsBtn").disabled = true;

    if (!classId) {
        select.innerHTML = '<option value="">Select Subject</option>';
        return;
    }

    try {
        const { data: assignments, error } = await db
            .from("class_subjects")
            .select("subject_id")
            .eq("school_id", currentSchoolId)
            .eq("class_id", classId);

        if (error) throw error;

        const ids = [...new Set(
            (assignments || []).map(item => item.subject_id)
        )];

        if (!ids.length) {
            select.innerHTML =
                '<option value="">No subjects assigned</option>';

            showMessage("No subjects are assigned to this class.", "info");
            return;
        }

        const { data: subjects, error: subjectError } = await db
            .from("subjects")
            .select("id, subject_name, subject_code")
            .eq("school_id", currentSchoolId)
            .in("id", ids)
            .order("subject_name");

        if (subjectError) throw subjectError;

        select.innerHTML = '<option value="">Select Subject</option>';

        (subjects || []).forEach(subject => {
            const option = document.createElement("option");

            option.value = subject.id;

            option.textContent =
                subject.subject_name +
                (subject.subject_code
                    ? " (" + subject.subject_code + ")"
                    : "");

            select.appendChild(option);
        });

    } catch (error) {
        console.error(error);

        select.innerHTML =
            '<option value="">Unable to load subjects</option>';

        showMessage(error.message, "error");
    }
}

// ==========================================
// LOAD ENROLLED STUDENTS AND EXISTING RESULTS
// ==========================================

async function loadStudents() {
    const classId = document.getElementById("classSelect").value;
    const subjectId = document.getElementById("subjectSelect").value;
    const session = document.getElementById("sessionSelect").value;
    const term = document.getElementById("termSelect").value;

    if (!classId || !subjectId || !session || !term) {
        showMessage(
            "Select class, subject, academic session and term.",
            "error"
        );

        return;
    }

    const button = document.getElementById("loadStudentsBtn");

    button.disabled = true;
    button.textContent = "Loading...";

    try {
        const { data: enrollments, error: enrollmentError } = await db
            .from("student_enrollments")
            .select("student_id")
            .eq("school_id", currentSchoolId)
            .eq("class_id", classId)
            .eq("academic_session", session)
            .eq("term", term);

        if (enrollmentError) throw enrollmentError;

        const ids = [...new Set(
            (enrollments || []).map(item => item.student_id)
        )];

        if (!ids.length) {
            studentsData = [];

            renderStudents();
            updateSummary();

            document.getElementById("saveResultsBtn").disabled = true;

            showMessage("No enrolled students found.", "info");

            return;
        }

        const { data: students, error: studentError } = await db
            .from("students")
            .select(
                "id, admission_number, first_name, middle_name, last_name"
            )
            .eq("school_id", currentSchoolId)
            .is("archived_at", null)
            .in("id", ids)
            .order("first_name");

        if (studentError) throw studentError;

        const { data: results, error: resultError } = await db
            .from("academic_results")
            .select(
                "id, student_id, ca_score, exam_score, total_score"
            )
            .eq("school_id", currentSchoolId)
            .eq("subject_id", subjectId)
            .eq("academic_session", session)
            .eq("term", term)
            .in("student_id", ids);

        if (resultError) throw resultError;

        const resultMap = {};

        (results || []).forEach(result => {
            resultMap[result.student_id] = result;
        });

        studentsData = (students || []).map(student => {
            const existing = resultMap[student.id];

            return {
                ...student,

                result_id: existing?.id || null,

                ca_score: existing
                    ? Number(existing.ca_score || 0)
                    : 0,

                exam_score: existing
                    ? Number(existing.exam_score || 0)
                    : 0
            };
        });

        renderStudents();
        updateSummary();

        document.getElementById("saveResultsBtn").disabled =
            studentsData.length === 0;

        showMessage(
            studentsData.length + " student(s) loaded successfully.",
            "success"
        );

    } catch (error) {
        console.error(error);
        showMessage(error.message, "error");

    } finally {
        button.disabled = false;
        button.textContent = "Load Students";
    }
}

// ==========================================
// ESCAPE HTML
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

// ==========================================
// DISPLAY STUDENTS
// ==========================================

function renderStudents() {
    const tbody = document.getElementById("resultsList");

    tbody.innerHTML = "";

    if (!studentsData.length) {
        tbody.innerHTML =
            '<tr><td colspan="7">No students found.</td></tr>';

        return;
    }

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
                <input
                    type="number"
                    class="score-input ca-input"
                    data-index="${index}"
                    min="0"
                    max="40"
                    step="0.01"
                    value="${student.ca_score}">
            </td>

            <td>
                <input
                    type="number"
                    class="score-input exam-input"
                    data-index="${index}"
                    min="0"
                    max="60"
                    step="0.01"
                    value="${student.exam_score}">
            </td>

            <td id="total-${index}">${total.toFixed(2)}</td>

            <td id="grade-${index}">${getGrade(total)}</td>
        `;

        tbody.appendChild(row);
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

    const ca = caInput.value === "" ? 0 : Number(caInput.value);

    const exam = examInput.value === "" ? 0 : Number(examInput.value);

    studentsData[index].ca_score = ca;
    studentsData[index].exam_score = exam;

    const total = ca + exam;

    document.getElementById(`total-${index}`).textContent =
        total.toFixed(2);

    document.getElementById(`grade-${index}`).textContent =
        getGrade(total);

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
// SCORE SUMMARY
// ==========================================

function updateSummary() {
    document.getElementById("studentCount").textContent =
        studentsData.length;

    document.getElementById("enteredCount").textContent =
        studentsData.filter(student =>
            student.ca_score > 0 || student.exam_score > 0
        ).length;

    const total = studentsData.reduce(
        (sum, student) =>
            sum + student.ca_score + student.exam_score,
        0
    );

    document.getElementById("classAverage").textContent =
        studentsData.length
            ? (total / studentsData.length).toFixed(2)
            : "0";
}

// ==========================================
// SAVE OR UPDATE RESULTS
// ==========================================

async function saveResults() {
    if (!studentsData.length) {
        showMessage("No results to save.", "error");
        return;
    }

    const button = document.getElementById("saveResultsBtn");

    button.disabled = true;
    button.textContent = "Saving...";

    let savedCount = 0;

    try {
        const subjectId = document.getElementById("subjectSelect").value;
        const session = document.getElementById("sessionSelect").value;
        const term = document.getElementById("termSelect").value;

        if (!subjectId || !session || !term) {
            throw new Error("Complete all result settings first.");
        }

        for (const student of studentsData) {
            const ca = Number(student.ca_score);
            const exam = Number(student.exam_score);

            if (
                !Number.isFinite(ca) ||
                !Number.isFinite(exam) ||
                ca < 0 || ca > 40 ||
                exam < 0 || exam > 60
            ) {
                throw new Error(
                    "Invalid score for " +
                    student.first_name +
                    ". CA must be 0–40 and Exam must be 0–60."
                );
            }

            const total = ca + exam;

            const payload = {
                school_id: currentSchoolId,
                student_id: student.id,
                subject_id: subjectId,
                academic_session: session,
                term: term,
                ca_score: ca,
                exam_score: exam,
                total_score: total
            };

            let response;

            if (student.result_id) {
                response = await db
                    .from("academic_results")
                    .update(payload)
                    .eq("id", student.result_id)
                    .eq("school_id", currentSchoolId);

            } else {
                response = await db
                    .from("academic_results")
                    .insert(payload)
                    .select("id")
                    .single();

                if (!response.error && response.data) {
                    student.result_id = response.data.id;
                }
            }

            if (response.error) {
                throw response.error;
            }

            savedCount++;
        }

        showMessage(
            savedCount + " student result(s) saved successfully.",
            "success"
        );

        await loadStudents();

    } catch (error) {
        console.error(error);

        showMessage(
            savedCount > 0
                ? savedCount + " result(s) saved before an error: " + error.message
                : error.message,
            "error"
        );

    } finally {
        button.disabled = studentsData.length === 0;
        button.textContent = "Save Results";
    }
}

// ==========================================
// MESSAGE DISPLAY
// ==========================================

function showMessage(message, type) {
    const box = document.getElementById("resultsMessage");

    box.textContent = message;
    box.style.display = "block";

    if (type === "success") {
        box.style.background = "#d4edda";
        box.style.color = "#155724";

    } else if (type === "error") {
        box.style.background = "#f8d7da";
        box.style.color = "#721c24";

    } else {
        box.style.background = "#d1ecf1";
        box.style.color = "#0c5460";
    }
}
