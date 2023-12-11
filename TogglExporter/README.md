# Toggl Importer

This plugin exports your data to [toggl](https://track.toggl.com).

The plugin uses the [toggl API](https://github.com/toggl/toggl_api_docs/) to fetch and push the data.

# German

Als Freelancer kann man sich die Regeln seiner Auftraggeber oftmals nicht aussuchen. Manche fordern eine Zeiterfassung und meistens verwenden sie andere Systeme als man selbst.
Für diesen Zweck ist dieses Plugin gedacht. Sofern man selbst seine Zeiten mit [Tyme](https://www.tyme-app.com/) erfasst, einer seiner Auftraggeber jedoch toggl Track verwendet, muss man seine Zeiten entweder doppelt erfassen oder man exportiert sie nach Toggl.

Um dieses Plugin zu verwenden müssen die Projektnamen und die Tasknamen von Tyme und Toggl exakt übereinstimmen.
Beim generieren der Vorschau überprüft das Plugin ob alle gewählten Projekte und Aufgaben so auch in toggl vorhanden sind.
Gibt es hier UNterschiede oder die Projekte und Aufgaben können nicht in toggl gefunden werden, erzeugt das Plugin im Vorschaufenster einen Fehlerreport und markiert alle fehlerhaften Datensätze in rot.

Hinweis: Die Kategory von Tyme wird als Client in Toggl verwendet

Der Export Button bleibt zwar in diesem Falle klickbar, startet aber den Export nicht solange die Fehler nicht behoben sind.

Installation: Siehe Tyme's [Plugin Repository](https://github.com/tyme-app/plugins/tree/main)

Lizenz: MIT

have fun

## English

As a freelancer, you often can't choose the rules of your clients. Some require time recording and they usually use different systems than you do.
This plugin is intended for this purpose. If you record your own times with [Tyme](https://www.tyme-app.com/), but one of your clients uses toggl Track, you either have to record your times twice or export them to Toggl.

To use this plugin, the project names and task names of Tyme and Toggl must match exactly.
When generating the preview, the plugin checks whether all selected projects and tasks are also available in toggl.
If there are differences or the projects and tasks cannot be found in toggl, the plugin generates an error report in the preview window and marks all incorrect data records in red.

Note: The Tyme category is used as a client in Toggl

The export button remains clickable in this case, but does not start the export until the errors are corrected.

Installation: See Tyme's [Plugin Repository](https://github.com/tyme-app/plugins/tree/main)

License: MIT