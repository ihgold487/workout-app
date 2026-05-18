import { useState, useEffect } from "react"
import TemplateView from "./components/TemplateView"
import SessionView from "./components/SessionView"
import HistoryView from "./components/HistoryView"
import ExerciseView from "./components/ExerciseView"

const seedExercises = [
  { id: 1, name: "Bench Press" },
  { id: 2, name: "Squat" },
  { id: 3, name: "Lat Pulldown" }
]

export default function App() {

    function exportBackup() {

      const data = {

        templates,

        history,

        sessions,

        exerciseLibrary

      }


      const blob =

        new Blob(

          [

            JSON.stringify(
              data,
              null,
              2
            )

          ],

          {

            type:
              "application/json"

          }

        )


      const url =

        URL.createObjectURL(
          blob
        )


      const a =
        document.createElement(
          "a"
        )


      a.href =
        url


      a.download =

        `workout-backup-${
          new Date()
            .toISOString()
            .slice(0,10)
        }.json`


      a.click()


      URL.revokeObjectURL(
        url
      )

    }
    
        async function importBackup(
      event
    ) {

      const file =

        event.target.files[0]


      if (!file)
        return


      const text =

        await file.text()


      const data =

        JSON.parse(
          text
        )


      if (
        data.templates
      )
        setTemplates(
          data.templates
        )


      if (
        data.history
      )
        setHistory(
          data.history
        )


      if (
        data.sessions
      )
        setSessions(
          data.sessions
        )


      if (
        data.exerciseLibrary
      )
        setExerciseLibrary(
          data.exerciseLibrary
        )

    }

  const [templates, setTemplates] = useState(
    () =>
      JSON.parse(
        localStorage.getItem("templates")
      ) || []
  )

  const [sessions, setSessions] = useState(
    () =>
      JSON.parse(
        localStorage.getItem("sessions")
      ) || []
  )
  
  const [history, setHistory] =
  useState(

    () =>

      JSON.parse(
        localStorage.getItem(
          "history"
        )
      )

      ||

      []

  )

  const [

      exerciseLibrary,

      setExerciseLibrary

    ] = useState(

      () =>

        JSON.parse(

          localStorage.getItem(
            "exerciseLibrary"
          )

        )

        ||

        seedExercises

    )

    const [
      selectedTemplateId,
      setSelectedTemplateId
    ] = useState(

      () =>

        JSON.parse(
          localStorage.getItem(
            "selectedTemplateId"
          )
        ) || null

    )



    const [
      selectedSessionId,
      setSelectedSessionId
    ] = useState(

      () =>

        JSON.parse(
          localStorage.getItem(
            "selectedSessionId"
          )
        ) || null

    )
    const [
      selectedHistory,
      setSelectedHistory
    ] =
    useState(
      null
    )
    
    const [
      showExercises,
      setShowExercises
    ] =
    useState(
      false
    )


    useEffect(() => {

        localStorage.setItem(

          "exerciseLibrary",

          JSON.stringify(
            exerciseLibrary
          )

        )

      localStorage.setItem(
        "templates",

        JSON.stringify(
          templates
        )
      )


      localStorage.setItem(
        "history",

        JSON.stringify(
          history
        )
      )


      localStorage.setItem(
        "sessions",

        JSON.stringify(
          sessions
        )
      )


      localStorage.setItem(
        "selectedTemplateId",

        JSON.stringify(
          selectedTemplateId
        )
      )


      localStorage.setItem(
        "selectedSessionId",

        JSON.stringify(
          selectedSessionId
        )
      )

    },
    [
      templates,
      history,
      sessions,
      exerciseLibrary,
      selectedTemplateId,
      selectedSessionId
    ])


  const selectedTemplate =
    templates.find(
      t =>
      t.id ===
      selectedTemplateId
    )

  const selectedSession =
    sessions.find(
      s =>
      s.id ===
      selectedSessionId
    )



  function addTemplate() {

    const name =
      prompt(
        "Template name"
      )

    if (!name)
      return


    setTemplates([
      ...templates,

      {
        id:
          Date.now(),

        name,

        exercises: [],

        lastCompleted:
          null
      }

    ])

  }

    if (
      showExercises
    ) {

      return (

        <ExerciseView

          exerciseLibrary={
            exerciseLibrary
          }

          setExerciseLibrary={
            setExerciseLibrary
          }

          setShowExercises={
            setShowExercises
          }

        />

      )

    }

    if (
      selectedHistory
    ) {

      return (

        <HistoryView

          selectedHistory={
            selectedHistory
          }

          setSelectedHistory={
            setSelectedHistory
          }

        />

      )

    }

  if (selectedSession) {

    return (

        <SessionView

              session={
                selectedSession
              }

              sessions={
                sessions
              }

              setSessions={
                setSessions
              }

              history={
                history
              }

              setHistory={
                setHistory
              }

              templates={
                templates
              }

              setTemplates={
                setTemplates
              }

              exerciseLibrary={
                exerciseLibrary
              }

              setSelectedSessionId={
                setSelectedSessionId
              }

            />

    )

  }



  if (selectedTemplate) {

    return (

      <TemplateView

        template={
          selectedTemplate
        }

        templates={
          templates
        }

        setTemplates={
          setTemplates
        }

        exerciseLibrary={
          exerciseLibrary
        }

        setSelectedTemplateId={
          setSelectedTemplateId
        }

        setSelectedSessionId={
          setSelectedSessionId
        }

        sessions={
          sessions
        }

        setSessions={
          setSessions
        }

      />

    )

  }



  return (

    <div
      style={{
        padding:
          "20px"
      }}
    >

      <h1>

        Workout Log

      </h1>
      
      <button

          onClick={
            exportBackup
          }

        >

          Export Backup

        </button>



        <input

          type="file"

          accept=".json"

          onChange={
            importBackup
          }

        />



        <hr />
      
      <button

          onClick={() =>

            setShowExercises(
              true
            )

          }

        >

          Manage Exercises

        </button>

    <hr />



      <button
        onClick={
          addTemplate
        }
      >

        + New Template

      </button>



      <hr />


      {

        templates.map(
          template => (

          <div
            key={
              template.id
            }
          >

        <div>

          <button

            onClick={() =>
              setSelectedTemplateId(
                template.id
              )
            }

          >

            {
              template.name
            }

          </button>


          {" "}


          <button

            onClick={() => {

              const copy = {

                ...template,

                id:
                  Date.now(),

                name:
                  template.name
                  + " copy",

                lastCompleted:
                  null

              }


              setTemplates([

                ...templates,

                copy

              ])

            }}

          >

            Clone

          </button>


          {" "}


          <button

            onClick={() => {

              setTemplates(

                templates.filter(
                  t =>

                    t.id !==
                    template.id
                )

              )

            }}

          >

            Delete

          </button>


          {" "}


          <button

            onClick={() => {

              const latest =

                history.find(
                  h =>

                    h.templateId ===
                    template.id
                )


              if (
                latest
              ) {

                setSelectedHistory(
                  latest
                )

              }

            }}

          >

            History

          </button>


          {" — Last: "}


          {

            template.lastCompleted

            ??

            "Never"

          }

        </div>
            {" — "}


            Last:


            {" "}


            {
              template.lastCompleted
              ?? "Never"
            }

          </div>

        ))
      }

    </div>

  )

}