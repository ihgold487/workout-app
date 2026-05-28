import { useState } from "react"

export default function WorkoutCalendar({
  history
}) {

  const [expanded,setExpanded] = useState(false)
  
  const [displayedMonth,setDisplayedMonth] = useState(new Date())

  const today = new Date()

  const startOfWeek = new Date(today)

  const day = startOfWeek.getDay()

  const mondayOffset =
    day === 0 ? -6 : 1 - day

  startOfWeek.setDate(
    today.getDate() + mondayOffset
  )

  const days = [...Array(7)].map((_,i) => {

    const date = new Date(startOfWeek)

    date.setDate(
      startOfWeek.getDate() + i
    )

    return date

  })

  const hasWorkout = date => {

  const dateString = date.toLocaleDateString()

    return history.some(session => {

      if (!session.completedAt)
        return false

      return (
        session.completedAt
          .split("T")[0] === dateString
      )

    })

  }

  return (

    <div
      onClick={() =>
        setExpanded(!expanded)
      }

      style={{
        marginBottom:"20px",
        padding:"12px",
        border:"1px solid #ccc",
        borderRadius:"12px",
        cursor:"pointer"
      }}
    >

      <div style={{
        display:"grid",
        gridTemplateColumns:"repeat(7,1fr)",
        textAlign:"center",
        gap:"4px"
      }}>

        {days.map(date => (

          <div key={date.toISOString()}>

            <div style={{
              fontSize:"12px",
              color:"#666"
            }}>

              {date.toLocaleDateString(
                undefined,
                { weekday:"short" }
              ).slice(0,2)}

            </div>

            <div style={{
              fontSize:"18px",
              fontWeight:"bold",

              color:
                hasWorkout(date)
                  ? "green"
                  : "black",

              border:

                date.toDateString() ===
                today.toDateString()

                  ? "2px solid #1976d2"

                  : "2px solid transparent",

              borderRadius:"999px",

              width:"32px",
              height:"32px",

              display:"flex",
              alignItems:"center",
              justifyContent:"center",

              margin:"0 auto"
            }}>

              {date.getDate()}

            </div>

          </div>

        ))}

     </div>

      {expanded && (() => {

        const firstDay = new Date(
          displayedMonth.getFullYear(),
          displayedMonth.getMonth(),
          1
        )

        const lastDay = new Date(
          displayedMonth.getFullYear(),
          displayedMonth.getMonth() + 1,
          0
        )

          const startOffset =
            (firstDay.getDay() + 6) % 7

          const totalDays =
            lastDay.getDate()

          const cells = []

          for (let i = 0; i < startOffset; i++)
            cells.push(null)

          for (let day = 1; day <= totalDays; day++)

            cells.push(

              new Date(
                displayedMonth.getFullYear(),
                displayedMonth.getMonth(),
                day
              )

            )

          return (

            <div style={{
              marginTop:"16px",
              paddingTop:"12px",
              borderTop:"1px solid #ddd"
            }}>

              <div style={{
                  display:"flex",
                  justifyContent:"space-between",
                  alignItems:"center",
                  marginBottom:"12px"
                }}>

                  <button
                    onClick={e => {

                      e.stopPropagation()

                      setDisplayedMonth(

                        new Date(
                          displayedMonth.getFullYear(),
                          displayedMonth.getMonth() - 1,
                          1
                        )

                      )

                    }}
                  >

                    ←

                  </button>

                  <div style={{
                    fontWeight:"bold"
                  }}>

                    {
                      displayedMonth.toLocaleDateString(
                        undefined,
                        {
                          month:"long",
                          year:"numeric"
                        }
                      )
                    }

                  </div>

                  <button
                    onClick={e => {

                      e.stopPropagation()

                      setDisplayedMonth(

                        new Date(
                          displayedMonth.getFullYear(),
                          displayedMonth.getMonth() + 1,
                          1
                        )

                      )

                    }}
                  >

                    →

                  </button>

                </div>

              <div style={{
                display:"grid",
                gridTemplateColumns:"repeat(7,1fr)",
                gap:"6px",
                textAlign:"center"
              }}>

                {

                  ["Mo","Tu","We","Th","Fr","Sa","Su"]

                    .map(day => (

                      <div
                        key={day}
                        style={{
                          fontSize:"12px",
                          color:"#666",
                          fontWeight:"bold"
                        }}
                      >

                        {day}

                      </div>

                    ))
                }

                {

                  cells.map((date,i) => (

                    <div
                      key={i}

                      style={{

                        height:"32px",

                        display:"flex",
                        alignItems:"center",
                        justifyContent:"center",

                        borderRadius:"999px",

                        color:

                          date && hasWorkout(date)
                            ? "green"
                            : "black",

                        border:

                          date &&
                          date.toDateString()
                          === today.toDateString()

                            ? "2px solid #1976d2"

                            : "2px solid transparent"

                      }}
                    >

                      {
                        date
                          ? date.getDate()
                          : ""
                      }

                    </div>

                  ))
                }

              </div>

            </div>

          )

        })()}

      </div>

      )

}