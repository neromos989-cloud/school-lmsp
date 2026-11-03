package id.web.assessment.man19jkt

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity

class SchoolCodeActivity : AppCompatActivity() {

    companion object {
        const val PREFS = "school"
        const val KEY_CODE = "code"
        const val EXTRA_CHANGE = "change"
        const val EXTRA_TEACHER = "teacher"
        const val KEY_TEACHER = "teacher_code"
        private val CODE_REGEX = Regex("^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$")

        fun savedCode(ctx: Context): String? =
            ctx.getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_CODE, null)

        fun teacherCode(ctx: Context): String? =
            ctx.getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_TEACHER, null)?.takeIf { it.isNotBlank() }

        fun urlFor(code: String) = "https://$code.${BuildConfig.BASE_DOMAIN}/login"
    }

    private lateinit var input: EditText
    private lateinit var preview: TextView
    private lateinit var error: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (intent.getBooleanExtra(EXTRA_TEACHER, false)) {
            intent.removeExtra(EXTRA_TEACHER)
            askTeacherCode { setup() }
            return
        }
        setup()
    }

    // Dialog kode guru (dari pintasan "Mode guru"). Kode kosong = mode guru dimatikan.
    private fun askTeacherCode(next: () -> Unit) {
        val box = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setText(teacherCode(this@SchoolCodeActivity) ?: "")
            setPadding(48, 32, 48, 32)
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.teacher_title)
            .setMessage(R.string.teacher_message)
            .setView(box)
            .setCancelable(false)
            .setPositiveButton(R.string.teacher_save) { _, _ ->
                getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                    .putString(KEY_TEACHER, box.text.toString().trim()).apply()
                next()
            }
            .setNegativeButton(R.string.teacher_cancel) { _, _ -> next() }
            .show()
    }

    private fun setup() {
        val change = intent.getBooleanExtra(EXTRA_CHANGE, false)
        val saved = savedCode(this)
        if (saved != null && !change) {          // sudah pernah memilih sekolah -> langsung masuk
            openSchool(saved, save = false)
            return
        }

        setContentView(R.layout.activity_school_code)
        input = findViewById(R.id.codeInput)
        preview = findViewById(R.id.preview)
        error = findViewById(R.id.error)
        val button = findViewById<Button>(R.id.continueBtn)

        if (saved != null) input.setText(saved)

        input.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                error.text = ""
                val c = clean()
                preview.text = if (c.isEmpty()) "" else urlFor(c)
            }
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
        })
        input.setOnEditorActionListener { _, id, _ ->
            if (id == EditorInfo.IME_ACTION_GO) { submit(); true } else false
        }
        button.setOnClickListener { submit() }
    }

    private fun clean() = input.text.toString().trim().lowercase()

    private fun submit() {
        val code = clean()
        if (!CODE_REGEX.matches(code)) {
            error.text = getString(R.string.code_invalid)
            return
        }
        openSchool(code, save = true)
    }

    private fun openSchool(code: String, save: Boolean) {
        if (save) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_CODE, code).apply()
        }
        startActivity(Intent(this, MainActivity::class.java).putExtra(KEY_CODE, code))
        finish()
    }
}
