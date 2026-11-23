// ==========================================
// SMART SCHOOL MANAGER - ACADEMIC RESULTS
// ==========================================

const supabaseClient = window.supabase.createClient(
    window.SUPABASE_CONFIG.URL,
    window.SUPABASE_CONFIG.KEY
);

const schoolId = "4c1c5a65-9557-4332-9a27-bc6754fe0301";

const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const sessionSelect = document.getElementById("sessionSelect");
const termSelect = document.getElementById("termSelect");
const loadStudentsBtn = document.getElementById("loadStudentsBtn");
const saveResultsBtn = document.getElementById("saveResultsBtn");
const resultsList = document.getElementById("resultsList");

let studentsData = [];

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {
    await loadClasses();
});


// ==========================================
// LOAD CLASSES
// ==========================================

async function loadClasses() {
    const { data, error } = await supabaseClient
        .from("classes")
        .select("id, class_name, arm")
        .eq("school_id", schoolId)
        .order("class_name");

    if (error) {
        alert("Unable to load classes: " + error.message);
        return;
    }

    classSelect.innerHTML = '<option value="">Select Class</option>';

    data.forEach(cls => {
        const option = document.createElement("option");
        option.value = cls.id;
        option.textContent = cls.arm
            ? `${cls.class_name} ${cls.arm}`
            : cls.class_name;

        classSelect.appendChild(option);
    }
}


// ==========================================
// LOAD SUBJECTS ASSIGNED TO CLASS
// ==========================================

classSelect.addEventListener("change", async () => {
    subjectSelect.innerHTML = '<option value="">Loading subjects...</option>';
    resultsList.innerHTML = "";
    saveResultsBtn.disabled = true;

    const classId = classSelect.value;

    if (!classId) {
        subjectSelect.innerHTML = '<option value="">Select Subject</option>';
        return;
    }

    const { data: assignments, error } = await supabaseClient
        .from("class_subjects")
        .select("subject_id")
        .eq("school_id", schoolId)
        .eq("class_id", classId);

    if (error) {
        subjectSelect.innerHTML = '<option value="">Failed to load subjects</option>';
        alert(error.message);
        return;
    }

    const subjectIds = [...new Set((assignments || []).map(a => a.subject_id))];

    if (subjectIds.length === 0) {
        subjectSelect.innerHTML = '<option value="">No subjects assigned</option>';
        return;
    }

    const { data: subjects, error: subjectError } = await supabaseClient
        .from("subjects")
        .select("id, subject_name, subject_code")
        .eq("school_id", schoolId)
        .in("id", subjectIds)
        .order("subject_name");

    if (subjectError) {
        alert(subjectError.message);
        return;
    }

    subjectSelect.innerHTML = '<option value="">Select Subject</option>';

    subjects.forEach(subject => {
        const option = document.createElement("option");
        option.value = subject.id;
        option.textContent = subject.subject_code
            ? `${subject.subject_name} (${subject.subject_code})`
            : subject.subject_name;

        subjectSelect.appendChild(option);
    }
});


// ==========================================
// LOAD STUDENTS BUTTON
// ==========================================

loadStudentsBtn.addEventListener("click", loadStudentsAndResults);


async function loadStudentsAndResults() {
    const classId = classSelect.value;
    const subjectId = subjectSelect.value;
    const session = sessionSelect.value;
    const term = termSelect.value;

    if (!classId || !subjectId || !session || !term) {
        alert("Please select Class, Subject, Academic Session and Term.");
        return;
    }

    resultsList.innerHTML = "";
    saveResultsBtn.disabled = true;

    loadStudentsBtn.disabled = true;
    loadStudentsBtn.textContent = "Loading...";

    try {
        // 1. Get students enrolled in the selected class/session/term
        const { data: enrollments, error: enrollmentError } = await supabaseClient
            .from("student_enrollments")
            .select("student_id")
            .eq("school_id", schoolId)
            .eq("class_id", classId)
            .eq("academic_session", session)
            .eq("term", term);

        if (enrollmentError) throw enrollmentError;

        const studentIds = [...new Set((enrollments || []).map(e => e.student_id))];

        if (studentIds.length === 0) {
            studentsData = [];
            resultsList.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center;padding:20px;">
                        No students enrolled in this class for the selected session and term.
                    </td>
                </tr>
            `;
            updateSummary();
            return;
        }

        // 2. Load active students
        const { data: students, error: studentError } = await supabaseClient
            .from("students")
            .select("id, admission_number, first_name, middle_name, last_name")
            .eq("school_id", schoolId)
            .is("archived_at", null)
            .in("id", studentIds)
            .order("first_name");

        if (studentError) throw studentError;

        // 3. Load existing results
        const { data: existingResults, error: resultsError } = await supabaseClient
            .from("academic_results")
            .select("student_id, ca_score, exam_score")
            .eq("school_id", schoolId)
            .eq("subject_id", subjectId)
            .eq("academic_session", session)
            .eq("term", term)
            .in("student_id", studentIds);

        if (resultsError) throw resultsError;

        const resultsMap = {};
        (existingResults || []).forEach(result => {
            resultsMap[result.student_id] = result;
        });

        // 4. Prepare student data
        studentsData = (students || []).map(student => {
            const existing = resultsMap[student.id];

            return {
                ...student,
                ca_score: existing ? Number(existing.ca_score) : 0,
                exam_score: existing ? Number(existing.exam_score) : 0
            };
        });

        // 5. Display student rows
        renderStudents();
        updateSummary();

        saveResultsBtn.disabled = studentsData.length === 0;

    } catch (error) {
        alert("Error loading results: " + error.message);
    } finally {
        loadStudentsBtn.disabled = false;
        loadStudentsBtn.textContent = "Load Students";
    }
}


// ==========================================
// DISPLAY STUDENTS
// ==========================================

function renderStudents() {
    resultsList.innerHTML = "";

    if (studentsData.length === 0) {
        resultsList.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center;padding:20px;">
                    No students found.
                </td>
            </tr>
        `;
        return;
    }

    studentsData.forEach((student, index) => {
        const row = document.createElement("tr");

        const fullName = [
            student.first_name,
            student.middle_name,
            student.last_name
        ].filter(Boolean).join(" ");

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${escapeHTML(student.admission_number || "")}</td>
            <td>${escapeHTML(fullName)}</td>
            <td>
                <input type="number"
                    class="ca-input"
                    data-index="${index}"
                    value="${student.ca_score}"
                    min="0"
                    max="40"
                    step="0.01">
            </td>
            <td>
                <input type="number"
                    class="exam-input"
                    data-index="${index}"
                    value="${student.exam_score}"
                    min="0"
                    max="60"
                    step="0.01">
            </td>
            <td class="total-cell" id="total-${index}">
                ${student.ca_score + student.exam_score}
            </td>
            <td class="grade-cell" id="grade-${index}">
                ${getGrade(student.ca_score + student.exam_score)}
            </td>
        `;

        resultsList.appendChild(row);
    });

    document.querySelectorAll(".ca-input, .exam-input").forEach(input => {
        input.addEventListener("input", handleScoreChange);
    });
}


// ==========================================
// SCORE CHANGES
// ==========================================

function handleScoreChange(event) {
    const index = Number(event.target.dataset.index);
    const student = studentsData[index];

    const caInput = document.querySelector(`.ca-input[data-index="${index}"]`);
    const examInput = document.querySelector(`.exam-input[data-index="${index}"]`);

    let ca = Number(caInput.value);
    let exam = Number(examInput.value);

    if (caInput.value === "") ca = 0;
    if (examInput.value === "") exam = 0;

    if (ca > 40) {
        caInput.value = 40;
        ca = 40;
    }

    if (ca < 0) {
        caInput.value = 0;
        ca = 0;
    }

    if (exam > 60) {
        examInput.value = 60;
        exam = 60;
    }

    if (exam < 0) {
        examInput.value = 0;
        exam = 0;
    }

    // Maximum total score = 100
    if (ca + exam > 100) {
        exam = 100 - ca;
        examInput.value = exam;
    }

    student.ca_score = ca;
    student.exam_score = exam;

    const total = ca + exam;

    document.getElementById(`total-${index}`).textContent = total;
    document.getElementById(`grade-${index}`).textContent = getGrade(total);

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
// SUMMARY STATISTICS
// ==========================================

function updateSummary() {
    const studentCount = document.getElementById("studentCount");
    const enteredCount = document.getElementById("enteredCount");
    const classAverage = document.getElementById("classAverage");

    studentCount.textContent = studentsData.length;

    const entered = studentsData.filter(s =>
        Number(s.ca_score) > 0 || Number(s.exam_score) > 0
    ).length;

    enteredCount.textContent = entered;

    if (studentsData.length === 0) {
        classAverage.textContent = "0";
        return;
    }

    const total = studentsData.reduce(
        (sum, s) => sum + Number(s.ca_score) + Number(s.exam_score),
        0
    );

    classAverage.textContent = (total / studentsData.length).toFixed(2);
}


// ==========================================
// SAVE RESULTS
// ==========================================

saveResultsBtn.addEventListener("click", saveResults);


async function saveResults() {
    if (studentsData.length === 0) {
        alert("No student results to save.");
        return;
    }

    const classId = classSelect.value;
    const subjectId = subjectSelect.value;
    const session = sessionSelect.value;
    const term = termSelect.value;

    if (!classId || !subjectId || !session || !term) {
        alert("Please select all required fields.");
        return;
    }

    // Validate scores
    for (const student of studentsData) {
        const ca = Number(student.ca_score);
        const exam = Number(student.exam_score);

        if (ca < 0 || ca > 40 || exam < 0 || exam > 60 || ca + exam > 100) {
            alert("Invalid score detected. CA must be 0–40 and Examination must be 0–60.");
            return;
        }
    }

    saveResultsBtn.disabled = true;
    saveResultsBtn.textContent = "Saving...";

    try {
        const payload = studentsData.map(student => ({
            school_id: schoolId,
            student_id: student.id,
            subject_id: subjectId,
            academic_session: session,
            term: term,
            ca_score: Number(student.ca_score),
            exam_score: Number(student.exam_score)
        }));

        const { error } = await supabaseClient
            .from("academic_results")
            .upsert(payload, {
                onConflict: "school_id,student_id,subject_id,academic_session,term"
            });

        if (error) throw error;

        alert("Academic results saved successfully!");

        await loadStudentsAndResults();

    } catch (error) {
        alert("Failed to save results: " + error.message);
    } finally {
        saveResultsBtn.disabled = studentsData.length === 0;
        saveResultsBtn.textContent = "Save Results";
    }
}


// ==========================================
// HTML SAFETY
// ==========================================

function escapeHTML(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
