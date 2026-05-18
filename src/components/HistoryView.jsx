export default function HistoryView({
  selectedHistory,
  setSelectedHistory
}) {

  return (

    <div style={{ padding: "20px" }}>

      <button
        onClick={() =>
          setSelectedHistory(
            null
          )
        }
      >

        ← Back

      </button>



      <h1>

        {
          selectedHistory
          .templateName
        }

      </h1>



      <p>

        Completed:

        {" "}

        {
          selectedHistory
          .completedAt
        }

      </p>



      {

        selectedHistory
        .exercises
        .map(
          exercise => (

            <div
              key={
                exercise.id
              }

              style={{
                marginBottom:
                  "20px"
              }}
            >

              <h3>

                {
                  exercise.name
                }

              </h3>

                {

                  exercise.note

                  &&

                  <div>

                    Note:

                    {" "}

                    {

                      exercise.note

                    }

                  </div>

                }

              {

                exercise.sets.map(
                  set => (

                    <div
                      key={
                        set.id
                      }
                    >

                      {
                        set.actualWeight
                      }

                      ×

                      {
                        set.actualReps
                      }

                    </div>

                  ))

              }

            </div>

          ))

      }

    </div>

  )

}