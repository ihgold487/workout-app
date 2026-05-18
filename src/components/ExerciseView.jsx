export default function ExerciseView({
  exerciseLibrary,
  setExerciseLibrary,
  setShowExercises
}) {

  return (

    <div style={{
      padding:
        "20px"
    }}>

      <button
        onClick={() =>
          setShowExercises(
            false
          )
        }
      >

        ← Back

      </button>



      <h1>

        Exercises

      </h1>



      <button

        onClick={() => {

          const name =
            prompt(
              "Exercise name"
            )


          const muscle =
            prompt(
              "Muscle group"
            )


          if(!name)
            return


          setExerciseLibrary([

            ...exerciseLibrary,

            {

              id:
                Date.now(),

              name,

              muscleGroup:
                muscle

            }

          ])

        }}

      >

        + Add Exercise

      </button>



      <hr />



      {

        exerciseLibrary.map(
          exercise => (

            <div
              key={
                exercise.id
              }
            >

              {

                exercise.name

              }


              {" — "}


              {

                exercise.muscleGroup

                ||

                "Uncategorized"

              }


              {" "}


              <button

                onClick={() =>

                  setExerciseLibrary(

                    exerciseLibrary.filter(
                      ex =>

                        ex.id !==
                        exercise.id
                    )

                  )

                }

              >

                Delete

              </button>

            </div>

          ))

      }

    </div>

  )

}