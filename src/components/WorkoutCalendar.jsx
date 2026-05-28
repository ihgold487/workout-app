export default function WorkoutCalendar({
  history
}) {

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

    <div style={{
      marginBottom:"20px",
      padding:"12px",
      border:"1px solid #ccc",
      borderRadius:"12px"
    }}>

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

    </div>

  )

}